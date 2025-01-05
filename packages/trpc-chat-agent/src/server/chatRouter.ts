import type { initTRPC } from '@trpc/server';
import type { AgentTools, ChatAgent } from '../common/agentTypes';
import type {
  AdvancedAIMessageData,
  ChatTreePath,
  ClientSideUpdate,
  HumanMessageData,
  ServerSideConversationData,
} from '../common/types';
import { EventEmitter, on } from 'events';
import { z } from 'zod';
import { chatBranchZod, ServerSideChatConversation } from '../common/types';
import { CallbackManager } from './callback';

type MakeChatRouterForAgentArgs<Agent extends ChatAgent<any>, Context extends object | ContextCallback> = {
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

export function makeChatRouterForAgent<Agent extends ChatAgent<any>, Context extends object | ContextCallback>({
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
          humanMessageContent: z.string().nullable(),
          branch: chatBranchZod,
        })
      )
      .subscription(async function* ({ input, ctx, signal }) {
        const eventEmitter = new EventEmitter();

        const controller = new AbortController();
        signal?.addEventListener('abort', () => {
          controller.abort();
        });

        const callbackEvents = (async function* () {
          for await (const [callbackEvent] of on(eventEmitter, 'event', { signal: controller.signal })) {
            if (callbackEvent === null) {
              break;
            }
            yield callbackEvent as ClientSideUpdate;
          }
        })();
        const passEvent = (event: ClientSideUpdate) => {
          eventEmitter.emit('event', event);
        };
        const endEvents = () => {
          eventEmitter.emit('event', null);
        };

        let conversationData: ServerSideConversationData<AgentTools<Agent>>;
        if (input.conversationId) {
          conversationData = await getConversation(input.conversationId, ctx as any);
        } else {
          conversationData = await createConversation(ctx as any);
        }

        const conversation = new ServerSideChatConversation(conversationData);
        let chatPath: ChatTreePath = input.branch;

        const { chatPath: newPath, aiMessageId } = addMessagePairToConversation(
          conversation,
          chatPath,
          input.humanMessageContent
        );
        chatPath = newPath;

        try {
          const events = await agent.invoke({
            conversationData: conversation.data,
            chatPath,
            ctx,
            callbackInvoker: ({ callbackArgs, callbackName, responseSchema, toolCallId, toolName }) => {
              if (!aiMessageId) {
                throw new Error('No AI message for ID generated by this point, this is unexpected');
              }

              const callbackId = conversation.generateId() + '-callback';
              const promise = callbackManager.getCallbackResponsePromise(
                {
                  conversationId: conversation.data.id,
                  messageId: aiMessageId,
                  toolCallId,
                  callbackId,
                },
                responseSchema
              );

              passEvent({
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
            signal: signal ?? controller.signal,
          });

          const processChatUpdates = async () => {
            for await (const event of events) {
              if (event.side === 'client') {
                const eventData = event.update;
                passEvent(eventData);
              }
              if (event.side === 'server') {
                const eventData = event.update;
                conversation.processMessageUpdate(eventData);
              }
            }

            // Conversation has ended
            endEvents();
          };
          void processChatUpdates();

          for await (const event of callbackEvents) {
            yield event;
          }
        } finally {
          conversation.abortAllPendingToolCalls();
          await saveConversation(conversation.data.id, conversation.data, ctx as any);

          // Currently, trpc seems to be struggling to trigger "conversation complete".
          // Yielding null to signal the conversation is complete (manually handled client-side)
          yield null;
        }
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

function addMessagePairToConversation<Agent extends ChatAgent<any>>(
  conversation: ServerSideChatConversation<Agent>,
  chatPath: ChatTreePath,
  humanMessageContent: string | null
): { chatPath: ChatTreePath; aiMessageId: string } {
  if (humanMessageContent !== null) {
    const aiMessageId = 'ai-' + conversation.generateId();
    const humanMessageId = 'human-' + conversation.generateId();

    const newHumanMessage: HumanMessageData = {
      kind: 'human',
      id: humanMessageId,
      content: humanMessageContent,
    };

    const newAIMessage: AdvancedAIMessageData<AgentTools<Agent>> = {
      kind: 'ai',
      id: aiMessageId,
      parts: [],
    };

    const newPath = conversation.pushHumanAiMessagePair(chatPath, newHumanMessage, newAIMessage);
    return { chatPath: newPath, aiMessageId };
  } else {
    const aiMessageId = 'ai-' + conversation.generateId();

    const newAIMessage: AdvancedAIMessageData<AgentTools<Agent>> = {
      kind: 'ai',
      id: aiMessageId,
      parts: [],
    };

    const newPath = conversation.pushUpdatedAiMessage(chatPath, newAIMessage);
    return { chatPath: newPath, aiMessageId };
  }
}
