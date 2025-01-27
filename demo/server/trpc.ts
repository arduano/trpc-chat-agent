import type { createContext } from './context';
import { EventEmitter } from 'node:events';
import { makeChatRouterForAgent, ServerSideChatConversationHelper } from '@trpc-chat-agent/core';
import { initTRPC } from '@trpc/server';
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
      return ServerSideChatConversationHelper.newConversationData<typeof agent>(id);
    },
    getConversation: async ({ id, ctx }) => {
      try {
        const data = await ctx.conversations.get(id);
        if (!data) {
          return null;
        }

        return data as any;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    t,
    saveConversation: async ({ id, conversation, ctx }) => {
      await ctx.conversations.set(id, conversation);
    },
  }),
});

export type AppRouter = typeof appRouter;
