import type { ClientSideConversation } from '../common';

const DB_NAME = 'trpc-chat-agent';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

export class ConversationStorage {
  private db: IDBDatabase | null = null;

  private constructor() {}

  static async create(): Promise<ConversationStorage> {
    const storage = new ConversationStorage();
    await storage.init();
    return storage;
  }

  private getDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  private async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      // This promise will never resolve if we're not in a browser
      if (typeof indexedDB === 'undefined') {
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  async saveConversation(conversation: ClientSideConversation): Promise<void> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const request = store.put({
        id: conversation.id,
        data: conversation,
        timestamp: Date.now(),
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getConversation(id: string): Promise<ClientSideConversation | null> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
    });
  }

  async getAllConversations(): Promise<ClientSideConversation[]> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result.map((item) => item.data));
      };
    });
  }

  async deleteConversation(id: string): Promise<void> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}
