import { initAgents } from '@arduano/trpc-langchain-agent/server';
import { kvsEnvStorage } from '@kvs/env';
import { initTRPC } from '@trpc/server';

export async function createContext() {
  // Primitive KV database to store conversations
  const conversationStore = await kvsEnvStorage({
    name: 'conversations',
    version: 1,
  });

  return {
    conversations: conversationStore,
  };
}

export const t = initTRPC.context<typeof createContext>().create();
export const ai = initAgents.context<typeof createContext>().create();
