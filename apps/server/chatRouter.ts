import type { AdvancedReactAgent, AgentTools } from './advancedReactAgent';
import type { ChatTree, ClientSideUpdate, ServerSideConversationData, ServerSideUpdate } from './types';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { t } from './src/router';
import { chatBranchZod, ServerSideChatConversation } from './types';

type MakeChatRouterForAgentArgs<Agent extends AdvancedReactAgent> = {
  agent: Agent;
  getConversation: (conversationId: string) => Promise<ServerSideConversationData<AgentTools<Agent>>>;
  saveConversation: (
    conversationId: string,
    conversation: ServerSideConversationData<AgentTools<Agent>>
  ) => Promise<void>;
};

export function makeChatRouterForAgent<Agent extends AdvancedReactAgent>({
  agent,
  getConversation,
  saveConversation,
}: MakeChatRouterForAgentArgs<Agent>) {
  const router = t.router({
    promptChat: t.procedure
      .input(
        z.object({
          conversationId: z.string().optional(),
          humanMessageContent: z.string(),
          branch: chatBranchZod,
        })
      )
      .subscription(async ({ input }) => {
        return observable<ClientSideUpdate>((emit) => {
          const controller = new AbortController();

          const runAgent = async () => {
            const conversationData = await getConversation(input.conversationId || '');
            const conversation = new ServerSideChatConversation(conversationData);

            let chatBranch: ChatTree = input.branch;

            try {
              const events = await agent.streamEvents(
                {
                  humanMessageContent: input.humanMessageContent,
                  conversationData: structuredClone(conversation.data),
                  chatBranch,
                },
                {
                  version: 'v2',
                  signal: controller.signal,
                }
              );

              for await (const event of events) {
                try {
                  if (event.name === 'on_conversation_client_update') {
                    const eventData = event.data as ClientSideUpdate;
                    emit.next(eventData);
                  }
                  if (event.name === 'on_conversation_server_update') {
                    const eventData = event.data as ServerSideUpdate;

                    if (eventData.kind === 'sync-conversation') {
                      chatBranch = eventData.tree;
                      conversation.data = eventData.conversationData;
                    } else {
                      conversation.processMessageUpdate(eventData);
                    }
                  }
                } catch (e) {
                  console.error(e);
                }
              }
            } catch (e) {
              console.error(e);
            }

            conversation.abortAllPendingToolCalls();
            emit.complete();
            await saveConversation(conversation.data.id, conversation.data);
          };

          runAgent();

          return () => {
            controller.abort();
          };
        });
      }),

    getChat: t.procedure.input(z.object({ conversationId: z.string() })).query(async ({ input }) => {
      const conversationData = await getConversation(input.conversationId);

      return new ServerSideChatConversation(conversationData).asClientSideConversation();
    }),
  });

  return router;
}
