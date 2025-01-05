import type { createContext } from './context';
import { EventEmitter } from 'node:events';
import { makeChatRouterForAgent, ServerSideChatConversation } from '@arduano/trpc-chat-agent';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { nanoid } from 'nanoid';
import { agent } from './agent';

export const ee = new EventEmitter();

export const t = initTRPC.context<typeof createContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

export const appRouter = router({
  chat: makeChatRouterForAgent({
    agent,
    createConversation: async (_ctx) => {
      const id = nanoid();
      return ServerSideChatConversation.newConversationData<typeof agent>(id);
    },
    getConversation: async (id, ctx) => {
      const data = await ctx.conversations.get(id);
      if (!data) {
        throw new Error('Conversation not found');
      }

      return data as any;
    },
    t,
    saveConversation: async (id, data, ctx) => {
      await ctx.conversations.set(id, data);
    },
  }),

  onMessage: t.procedure.subscription(() => {
    return observable<{ message: string; timestamp: number }>((emit) => {
      const onMessage = (data: { message: string; timestamp: number }) => {
        emit.next(data);
      };

      ee.on('message', onMessage);

      return () => {
        ee.off('message', onMessage);
      };
    });
  }),
  sendMessage: t.procedure
    .input((value: unknown) => {
      if (typeof value !== 'string') {
        throw new TypeError('Invalid input');
      }

      return value;
    })
    .mutation((opts) => {
      const message = {
        message: opts.input,
        timestamp: Date.now(),
      };
      ee.emit('message', message);
      return message;
    }),
});

export type AppRouter = typeof appRouter;
