import { create } from "zustand";
import { combine } from "zustand/middleware";
import { ClientSideChatConversation, ClientSideUpdate } from "./types";
import { mergeKeepingOldReferences } from "./merge";

export const useConversationStore = create(
  combine(
    {
      conversations: {} as Record<string, ClientSideChatConversation<any>>,
    },
    (set, get) => {
      const getConversation = (conversationId: string) => {
        return get().conversations[conversationId];
      };
      const setConversation = (
        conversationId: string,
        conversation: ClientSideChatConversation<any>
      ) => {
        set((state) => ({
          conversations: {
            ...state.conversations,
            [conversationId]: conversation,
          },
        }));
      };

      return {
        processClientEvent: (event: ClientSideUpdate) => {
          if (event.kind === "sync-conversation") {
            const { conversationId, conversationData } = event;
            const existingConversation = getConversation(conversationId);
            if (existingConversation) {
              // If an existing conversation exists, merge the data so that references are
              // preserved if the underlying data is the same
              const merged = mergeKeepingOldReferences(
                existingConversation.data,
                conversationData
              );
              setConversation(
                conversationId,
                new ClientSideChatConversation(merged)
              );
            } else {
              setConversation(
                conversationId,
                new ClientSideChatConversation(conversationData)
              );
            }
          } else {
            const conversation = getConversation(event.conversationId);
            if (!conversation) {
              console.error(
                `No conversation found for conversation ID ${event.conversationId}`
              );
              return;
            }

            conversation.processMessageUpdate(event);
          }
        },
      };
    }
  )
);
