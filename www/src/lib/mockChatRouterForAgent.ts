import type { AnyStructuredChatTool, ChatAgent, ClientSideConversationData } from '@trpc-chat-agent/core';
import type { TRPCLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { makeChatRouterForAgent, ServerSideChatConversation } from '@trpc-chat-agent/core';
import { createTRPCClient } from '@trpc/client';
import { callTRPCProcedure, initTRPC } from '@trpc/server';
import { isObservable, observable, observableToAsyncIterable } from '@trpc/server/observable';
import { isAsyncIterable, TRPCError } from '@trpc/server/unstable-core-do-not-import';

export function buildMockTrpcChatRouter<Tools extends readonly AnyStructuredChatTool[]>(agent: ChatAgent<Tools>) {
  const t = initTRPC.create({ isServer: true });

  const conversationsMap: Record<string, ClientSideConversationData> = {};

  const appRouter = makeChatRouterForAgent({
    t: t as any,
    agent,
    createConversation: async () => ServerSideChatConversation.newConversationData<typeof agent>('chat_id'),
    getConversation: async (id) => (conversationsMap[id] as any) ?? null,
    saveConversation: async (id, data) => {
      conversationsMap[id] = data;
    },
    saveIntervalMs: 10,
  });

  type AppRouter = typeof appRouter;

  function mockLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
    return () => {
      return ({ op }) => {
        return observable((observer) => {
          const handler = async () => {
            const result = await callTRPCProcedure({
              procedures: appRouter._def.procedures,
              ctx: {},
              path: op.path,
              input: op.input,
              getRawInput: async () => op.input,
              type: op.type,
              signal: op.signal,
            });

            op.signal?.addEventListener('abort', () => {
              observer.complete();
            });

            const isIterableResult = isAsyncIterable(result) || isObservable(result);

            if (op.type !== 'subscription') {
              if (isIterableResult) {
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: 'Cannot return an async iterable in a non-subscription call',
                });
              }
              observer.next({
                result: {
                  type: 'data',
                  data: result,
                },
                context: op.context,
              });
              observer.complete();
            } else {
              if (!isIterableResult) {
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: 'Cannot return a non-async iterable in a subscription call',
                });
              }

              const iterable = isObservable(result) ? observableToAsyncIterable(result, op.signal) : result;
              for await (const item of iterable) {
                if (op.signal?.aborted) {
                  break;
                }

                observer.next({
                  result: {
                    type: 'data',
                    data: item,
                  },
                  context: op.context,
                });
              }
              observer.complete();
            }
          };

          handler();
        });
      };
    };
  }

  const trpcClient = createTRPCClient<AppRouter>({
    links: [mockLink()],
  });

  return trpcClient;
}
