import { initAgents } from '@arduano/trpc-chat-agent';
import { LangChainAgentsBackend } from '@arduano/trpc-chat-agent-langchain';
import { kvsLocalStorage } from '@kvs/node-localstorage';
import { initTRPC } from '@trpc/server';
import AsyncLock from 'async-lock';

export async function createContext() {
  // Primitive KV database to store conversations
  const conversationStore = await kvsLocalStorage({
    name: 'conversations',
    version: 1,
  });

  const todosStore = await kvsLocalStorage({
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
