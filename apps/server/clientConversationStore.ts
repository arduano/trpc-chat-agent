import { create } from "zustand";
import { combine } from "zustand/middleware";
import { ClientSideChatConversation, ClientSideUpdate } from "./types";
import { mergeKeepingOldReferences } from "./merge";
import { AdvancedReactAgent } from "./advancedReactAgent";

// Helper function for propagating the "Agent" type into the store
function makeConversationStore() {
  return create(
    combine(
      {
        conversations: {} as Record<
          string,
          ClientSideChatConversation<AdvancedReactAgent> | undefined
        >,
      },
      (set, get) => {
        const getConversation = (conversationId: string) => {
          return get().conversations[conversationId];
        };
        const setConversation = (
          conversationId: string,
          conversation: ClientSideChatConversation<AdvancedReactAgent>
        ) => {
          set((state) => ({
            conversations: {
              ...state.conversations,
              [conversationId]: conversation,
            },
          }));
        };

        return {
          mutate: {
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
            isConversationPresent: (conversationId: string) => {
              return !!getConversation(conversationId);
            },
            setConversationIfNotPresent: (
              conversationId: string,
              conversation: ClientSideChatConversation<AdvancedReactAgent>
            ) => {
              if (!!getConversation(conversationId)) {
                setConversation(conversationId, conversation);
              }
            },
          },
          get: {
            conversation: (conversationId: string) => {
              return getConversation(conversationId);
            },
          },
        };
      }
    )
  );
}

export const useConversationStore = makeConversationStore();
