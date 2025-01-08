import type { initTRPC } from '@trpc/server';
import type { AgentTools, ChatAgent } from '../common/agentTypes';
import type {
  AdvancedAIMessageData,
  ChatTreePath,
  ClientSideUpdate,
  HumanMessageData,
  ServerSideConversationData,
} from '../common/types';
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
  saveIntervalMs?: number;
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
  saveIntervalMs,
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
      .subscription(async function* ({ input, ctx, signal }): AsyncGenerator<ClientSideUpdate | null> {
        const emitter = new AsyncEventEmitter<ClientSideUpdate | null>(signal);

        const controller = new AbortController();
        signal?.addEventListener('abort', () => {
          controller.abort();
        });

        const passEvent = (event: ClientSideUpdate) => {
          emitter.emit(event);
        };
        const endEvents = () => {
          emitter.emit(null);
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

        let saveInterval: NodeJS.Timeout | undefined;
        if (typeof saveIntervalMs === 'number') {
          saveInterval = setInterval(() => {
            void saveConversation(conversation.data.id, conversation.data, ctx as any);
          }, saveIntervalMs);

          signal?.addEventListener('abort', () => {
            clearInterval(saveInterval);
          });
        }

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

          yield {
            kind: 'sync-conversation',
            conversationId: conversation.data.id,
            conversationData: conversation.asClientSideConversation(),
            path: chatPath,
          };

          for await (const event of emitter) {
            yield event;
          }

          yield {
            kind: 'sync-conversation',
            conversationId: conversation.data.id,
            conversationData: conversation.asClientSideConversation(),
            path: chatPath,
          };
        } finally {
          clearInterval(saveInterval);
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

// Simple runtime-agnostic async event emitter implementation
class AsyncEventEmitter<T> {
  private resolvers: ((value: T) => void)[] = [];
  private eventQueue: T[] = [];
  private signal?: AbortSignal;

  constructor(signal?: AbortSignal) {
    this.signal = signal;
    signal?.addEventListener('abort', () => this.cleanup());
  }

  emit(value: T) {
    if (this.resolvers.length > 0) {
      // If there are waiting resolvers, resolve them immediately
      const resolver = this.resolvers.shift()!;
      resolver(value);
    } else {
      // Otherwise queue the event
      this.eventQueue.push(value);
    }
  }

  private cleanup() {
    this.resolvers = [];
    this.eventQueue = [];
  }

  async *[Symbol.asyncIterator]() {
    if (this.signal?.aborted) {
      return;
    }

    while (true) {
      let value: T;

      if (this.eventQueue.length > 0) {
        // If there are queued events, process them first
        value = this.eventQueue.shift()!;
      } else {
        // Otherwise wait for new events
        value = await new Promise<T>((resolve) => {
          if (this.signal?.aborted) {
            resolve(null as T);
            return;
          }
          this.resolvers.push(resolve);
        });
      }

      if (value === null || this.signal?.aborted) {
        break;
      }
      yield value;
    }
  }
}
