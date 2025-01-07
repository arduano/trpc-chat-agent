import {
  AnyStructuredChatTool,
  ChatAgent,
  ClientSideChatConversation,
  ClientSideConversationData,
  makeChatRouterForAgent,
  ServerSideChatConversation,
} from '@trpc-chat-agent/core';
import { createTRPCClient, TRPCLink } from '@trpc/client';
import { initTRPC, AnyRouter, AnyTRPCProcedure } from '@trpc/server';
import { observable } from '@trpc/server/observable';

export function buildMockTrpcChatRouter<Tools extends readonly AnyStructuredChatTool[]>(
  agent: ChatAgent<Tools>,
  getConversationById?: (id: string) => ClientSideConversationData<Tools>
) {
  const t = initTRPC.create({ isServer: true });

  const appRouter = makeChatRouterForAgent({
    t: t as any,
    agent,
    createConversation: async () => ServerSideChatConversation.newConversationData<typeof agent>('chat_id'),
    getConversation: async () => (getConversationById ? (getConversationById('chat_id') as any) : null),
    saveConversation: async () => {},
  });

  type AppRouter = typeof appRouter;

  const callerFactory = t.createCallerFactory(appRouter);
  const caller = callerFactory({});

  function mockLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
    return () => {
      return ({ op }) => {
        return observable((observer) => {
          const handler = async () => {
            const procedureFn = op.path
              .split('.')
              .reduce((acc, segment) => acc[segment], caller as any) as AnyTRPCProcedure;

            if (op.type !== 'subscription') {
              const result = await procedureFn(op.input as any);
              observer.next({
                result: {
                  type: 'data',
                  data: result,
                },
                context: op.context,
              });
              observer.complete();
            } else {
              const iterable = await procedureFn(op.input as any);
              for await (const item of iterable) {
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
