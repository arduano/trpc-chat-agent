import type { initTRPC } from '@trpc/server';
import type { AgentTools } from '../common/agentTypes';
import type { ChatTree, ClientSideUpdate, ServerSideConversationData, ServerSideUpdate } from '../common/types';
import type { AdvancedReactAgent } from './advancedReactAgent';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { chatBranchZod, ServerSideChatConversation } from '../common/types';

type MakeChatRouterForAgentArgs<Agent extends AdvancedReactAgent, Context extends object | ContextCallback> = {
  agent: Agent;
  t: TrpcWithContext<Context>;
  createConversation: (ctx: Context) => Promise<ServerSideConversationData<AgentTools<Agent>>>;
  getConversation: (conversationId: string, ctx: Context) => Promise<ServerSideConversationData<AgentTools<Agent>>>;
  saveConversation: (
    conversationId: string,
    conversation: ServerSideConversationData<AgentTools<Agent>>,
    ctx: Context
  ) => Promise<void>;
};

type ContextCallback = (...args: any[]) => object | Promise<object>;
type TrpcWithContext<Context extends object | ContextCallback> = ReturnType<
  ReturnType<typeof initTRPC.context<Context>>['create']
>;

export function makeChatRouterForAgent<Agent extends AdvancedReactAgent, Context extends object | ContextCallback>({
  agent,
  getConversation,
  saveConversation,
  createConversation,
  t,
}: MakeChatRouterForAgentArgs<Agent, Context>) {
  const router = t.router({
    promptChat: t.procedure
      .input(
        z.object({
          conversationId: z.string().optional(),
          humanMessageContent: z.string(),
          branch: chatBranchZod,
        })
      )
      .subscription(async ({ input, ctx }) => {
        return observable<ClientSideUpdate>((emit) => {
          const controller = new AbortController();

          const runAgent = async () => {
            let conversationData: ServerSideConversationData<AgentTools<Agent>>;
            if (input.conversationId) {
              conversationData = await getConversation(input.conversationId, ctx as any);
            } else {
              conversationData = await createConversation(ctx as any);
            }

            const conversation = new ServerSideChatConversation(conversationData);

            let chatBranch: ChatTree = input.branch;

            try {
              const events = await agent.streamEvents(
                {
                  humanMessageContent: input.humanMessageContent,
                  conversationData: structuredClone(conversation.data),
                  chatBranch,
                  ctx,
                  callbacks: null as any,
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
            } finally {
              conversation.abortAllPendingToolCalls();
              emit.complete();
              await saveConversation(conversation.data.id, conversation.data, ctx as any);
            }
          };

          runAgent().catch((e) => {
            console.error(e);
            emit.error(e);
          });

          return () => {
            controller.abort();
          };
        });
      }),

    getChat: t.procedure.input(z.object({ conversationId: z.string() })).query(async ({ input, ctx }) => {
      const conversationData = await getConversation(input.conversationId, ctx as any);

      return new ServerSideChatConversation(conversationData).asClientSideConversation();
    }),
  });

  return router;
}
