import type { initTRPC } from '@trpc/server';
import type { AgentExtraArgs, AgentTools, AnyChatAgent } from '../common/agentTypes';
import type {
  AIMessageData,
  ChatTreePath,
  ClientSideUpdate,
  ServerSideConversation,
  UserMessageData,
} from '../common/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { chatBranchZod, ServerSideChatConversationHelper } from '../common/types';
import { CallbackManager } from './callback';

type MakeChatRouterForAgentArgs<Agent extends AnyChatAgent, Context extends object | ContextCallback> = {
  agent: Agent;
  t: TrpcWithContext<Context>;
  createConversation: (args: {
    ctx: Context;
    extraArgs: AgentExtraArgs<Agent>;
  }) => Promise<ServerSideConversation<AgentTools<Agent>>>;
  getConversation: (args: {
    id: string;
    ctx: Context;
    extraArgs: AgentExtraArgs<Agent>;
  }) => Promise<ServerSideConversation<AgentTools<Agent>> | null>;
  saveConversation: (args: {
    id: string;
    conversation: ServerSideConversation<AgentTools<Agent>>;
    ctx: Context;
    extraArgs: AgentExtraArgs<Agent>;
  }) => Promise<void>;
  saveIntervalMs?: number;
};

type ContextCallback = (...args: any[]) => object | Promise<object>;
type TrpcWithContext<Context extends object | ContextCallback> = ReturnType<
  ReturnType<typeof initTRPC.context<Context>>['create']
>;

export function makeChatRouterForAgent<Agent extends AnyChatAgent, Context extends object | ContextCallback>({
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
          userMessageContent: z.string().nullable(),
          branch: chatBranchZod,
          extraArgs: agent.extraArgsSchema,
        })
      )
      .mutation(async ({ input, ctx, signal }) => {
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

        let conversationData: ServerSideConversation<AgentTools<Agent>>;
        if (input.conversationId) {
          const foundConversation = await getConversation({
            ctx: ctx as any,
            id: input.conversationId,
            extraArgs: input.extraArgs,
          });
          if (foundConversation) {
            conversationData = foundConversation;
          } else {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
          }
        } else {
          conversationData = await createConversation({
            ctx: ctx as any,
            extraArgs: input.extraArgs,
          });
        }

        const conversation = new ServerSideChatConversationHelper(conversationData);
        let chatPath: ChatTreePath = input.branch;

        const { chatPath: newPath, aiMessageId } = addMessagePairToConversation(
          conversation,
          chatPath,
          input.userMessageContent
        );
        chatPath = newPath;

        const saveCurrentConversation = async () => {
          await saveConversation({
            id: conversation.data.id,
            conversation: conversation.data,
            ctx: ctx as any,
            extraArgs: input.extraArgs,
          });
        };

        // Save the conversation with the new messages added
        await saveCurrentConversation();

        let saveInterval: NodeJS.Timeout | undefined;
        if (typeof saveIntervalMs === 'number') {
          saveInterval = setInterval(() => {
            void saveCurrentConversation();
          }, saveIntervalMs);

          signal?.addEventListener('abort', () => {
            clearInterval(saveInterval);
          });
        }

        const cleanup = () => {
          clearInterval(saveInterval);
          conversation.abortAllPendingToolCalls();
          saveCurrentConversation();
        };

        let invokedCleanup = false;

        const invokeCleanup = () => {
          if (!invokedCleanup) {
            invokedCleanup = true;
            cleanup();
          }
        };

        const streamIterable = async function* (): AsyncGenerator<ClientSideUpdate> {
          controller.signal.addEventListener('abort', () => {
            invokeCleanup();
          });

          try {
            const events = await agent.invoke({
              conversationData: conversation.data,
              chatPath,
              ctx,
              extraArgs: input.extraArgs,
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
            invokeCleanup();
          }
        };

        const stream = streamIterable();

        return {
          stream,
        };
      }),

    getChat: t.procedure
      .input(z.object({ conversationId: z.string(), extraArgs: agent.extraArgsSchema }))
      .query(async ({ input, ctx }) => {
        const conversationData = await getConversation({
          ctx: ctx as any,
          id: input.conversationId,
          extraArgs: input.extraArgs,
        });

        if (!conversationData) {
          return null;
        }

        return new ServerSideChatConversationHelper(conversationData).asClientSideConversation();
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

function addMessagePairToConversation<Agent extends AnyChatAgent>(
  conversation: ServerSideChatConversationHelper<Agent>,
  chatPath: ChatTreePath,
  userMessageContent: string | null
): { chatPath: ChatTreePath; aiMessageId: string } {
  if (userMessageContent !== null) {
    const aiMessageId = 'ai-' + conversation.generateId();
    const userMessageId = 'user-' + conversation.generateId();

    const newUserMessage: UserMessageData = {
      kind: 'user',
      id: userMessageId,
      parts: [{ type: 'text', text: userMessageContent }],
      createdAt: new Date().toISOString(),
    };

    const newAIMessage: AIMessageData<AgentTools<Agent>> = {
      kind: 'ai',
      id: aiMessageId,
      parts: [],
      createdAt: new Date().toISOString(),
    };

    const newPath = conversation.pushUserAiMessagePair(chatPath, newUserMessage, newAIMessage);
    return { chatPath: newPath, aiMessageId };
  } else {
    const aiMessageId = 'ai-' + conversation.generateId();

    const newAIMessage: AIMessageData<AgentTools<Agent>> = {
      kind: 'ai',
      id: aiMessageId,
      parts: [],
      createdAt: new Date().toISOString(),
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
