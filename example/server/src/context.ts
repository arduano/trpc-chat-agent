import { initAgents } from '@arduano/trpc-chat-agent';
import { LangChainAgentsBackend } from '@arduano/trpc-chat-agent-langchain';
import { kvsEnvStorage } from '@kvs/env';
import { initTRPC } from '@trpc/server';
import AsyncLock from 'async-lock';

export async function createContext() {
  // Primitive KV database to store conversations
  const conversationStore = await kvsEnvStorage({
    name: 'conversations',
    version: 1,
  });

  const todosStore = await kvsEnvStorage({
    name: 'todos',
    version: 1,
  });

  // Help prevent race conditions
  const todosLock = new AsyncLock();

  return {
    conversations: conversationStore,
    todos: todosStore,
    todosLock,
  };
}

export const t = initTRPC.context<typeof createContext>().create();
export const ai = initAgents.context<typeof createContext>().backend(new LangChainAgentsBackend()).create();
