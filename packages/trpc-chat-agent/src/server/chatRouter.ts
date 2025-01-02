import type { initTRPC } from '@trpc/server';
import type { AgentTools, ChatAgent } from '../common/agentTypes';
import type { ChatTree, ClientSideUpdate, ServerSideConversationData } from '../common/types';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { chatBranchZod, ServerSideChatConversation } from '../common/types';
import { CallbackManager, generateCallbackId } from './callback';

type MakeChatRouterForAgentArgs<Agent extends ChatAgent, Context extends object | ContextCallback> = {
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

export function makeChatRouterForAgent<Agent extends ChatAgent, Context extends object | ContextCallback>({
  agent,
  getConversation,
  saveConversation,
  createConversation,
  t,
}: MakeChatRouterForAgentArgs<Agent, Context>) {
  const callbackManager = new CallbackManager();

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

            let aiMessageId: string | undefined; // Should get initialized on the first "sync-conversation" event

            try {
              const events = await agent.invoke({
                humanMessageContent: input.humanMessageContent,
                conversationData: structuredClone(conversation.data),
                chatBranch,
                ctx,

                // TODO: Remove any
                callbackInvoker: ({ callbackArgs, callbackName, responseSchema, toolCallId, toolName }: any) => {
                  if (!aiMessageId) {
                    throw new Error('No AI message for ID generated by this point, this is unexpected');
                  }

                  const callbackId = generateCallbackId();
                  const promise = callbackManager.getCallbackResponsePromise(
                    {
                      conversationId: conversation.data.id,
                      messageId: aiMessageId,
                      toolCallId,
                      callbackId,
                    },
                    responseSchema
                  );

                  emit.next({
                    kind: 'request-callback-response',
                    conversationId: conversation.data.id,
                    messageId: aiMessageId,
                    toolCallId,
                    callbackId,
                    toolName,
                    callbackName,
                    requestArgs: callbackArgs,
                  });

                  return promise;
                },
                controller,
              });

              for await (const event of events) {
                try {
                  if (event.side === 'client') {
                    emit.next(event.update);
                  }
                  if (event.side === 'server') {
                    const eventData = event.update;

                    if (eventData.kind === 'sync-conversation') {
                      chatBranch = eventData.tree;
                      conversation.data = eventData.conversationData;

                      const newAiMessageId = conversation.getAIMessageIdAt(chatBranch);
                      if (!newAiMessageId) {
                        throw new Error('No AI message generated by the conversation sync, this is unexpected');
                      }

                      aiMessageId = newAiMessageId;
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

    handleCallback: t.procedure
      .input(
        z.object({
          conversationId: z.string(),
          messageId: z.string(),
          toolCallId: z.string(),
          callbackId: z.string(),
          callbackArgs: z.any(),
        })
      )
      .mutation(async ({ input }) => {
        await callbackManager.respondToCallback(
          {
            conversationId: input.conversationId,
            messageId: input.messageId,
            toolCallId: input.toolCallId,
            callbackId: input.callbackId,
          },
          input.callbackArgs
        );
      }),
  });

  return router;
}
