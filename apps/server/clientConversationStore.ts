import { create } from "zustand";
import { combine } from "zustand/middleware";
import { ClientSideChatConversation, ClientSideUpdate } from "./types";
import { mergeKeepingOldReferences } from "./merge";
import { AdvancedReactAgent } from "./advancedReactAgent";

// Helper function for propagating the "Agent" type into the store
function makeConversationStore<Agent extends AdvancedReactAgent>() {
  return create(
    combine(
      {
        conversations: {} as Record<string, ClientSideChatConversation<Agent>>,
      },
      (set, get) => {
        const getConversation = (conversationId: string) => {
          return get().conversations[conversationId];
        };
        const setConversation = (
          conversationId: string,
          conversation: ClientSideChatConversation<Agent>
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
}

const commonStore = makeConversationStore<AdvancedReactAgent>();

export function useConversationStore<Agent extends AdvancedReactAgent>() {
  // Map the inner conversation store type to the agent type

  // TODO: Is there a cleaner way to get the store type?
  return commonStore() as ReturnType<
    ReturnType<typeof makeConversationStore<Agent>>["getState"]
  >;
}
