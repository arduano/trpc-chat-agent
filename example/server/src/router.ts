import { nanoid } from 'nanoid';
import { ServerSideChatConversation } from '../../../packages/trpc-langchain-agent/src/common/types';
import { makeChatRouterForAgent } from '../../../packages/trpc-langchain-agent/src/server/chatRouter';
import { agent } from './agent';
import { t } from './context';

const router = t.router({
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
});

export type AppRouter = typeof router;
export default router;
