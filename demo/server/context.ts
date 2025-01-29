import { kvsLocalStorage } from '@kvs/node-localstorage';
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
