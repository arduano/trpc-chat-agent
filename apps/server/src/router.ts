import { initTRPC } from '@trpc/server';
import { makeChatRouterForAgent } from '../chatRouter';
import { ServerSideChatConversation } from '../types';
import { agent } from './agent';

export const t = initTRPC.create();

const router = t.router({
  chat: makeChatRouterForAgent({
    agent,
    getConversation: async () => {
      return serverSideConversation.data;
    },
    saveConversation: async (id, data) => {
      serverSideConversation.data = data;
    },
  }),
});

const serverSideConversation = new ServerSideChatConversation<typeof agent>(
  ServerSideChatConversation.newConversationData('test')
);

export type AppRouter = typeof router;
export default router;
