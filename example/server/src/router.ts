import { initTRPC } from '@trpc/server';
import { ServerSideChatConversation } from '../../../packages/trpc-langchain-agent/src/common/types';
import { makeChatRouterForAgent } from '../../../packages/trpc-langchain-agent/src/server/chatRouter';
import { agent } from './agent';

export const t = initTRPC.create();

const router = t.router({
  chat: makeChatRouterForAgent({
    agent,
    getConversation: async () => {
      return serverSideConversation.data;
    },
    t,
    saveConversation: async (id, data) => {
      serverSideConversation.data = data;
    },
  }),
});

const serverSideConversation = new ServerSideChatConversation<typeof agent>(
  ServerSideChatConversation<typeof agent>.newConversationData('test')
);

export type AppRouter = typeof router;
export default router;
