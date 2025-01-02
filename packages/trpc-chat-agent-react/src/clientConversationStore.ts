import type { AgentTools, ChatAgent, ClientSideConversationData, ClientSideUpdate } from '@arduano/trpc-chat-agent';
import type { Draft } from 'immer';
import { ClientSideChatConversation } from '@arduano/trpc-chat-agent';
import { castDraft, produce } from 'immer';
import { create } from 'zustand';
import { combine } from 'zustand/middleware';

export type ActiveCallback<ToolName extends string, CallbackName extends string, ToolArgs> = {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  callbackId: string;
  callbackName: CallbackName;
  toolName: ToolName;
  args: ToolArgs;
  remove: () => void;
};

type AnyActiveCallback = ActiveCallback<string, string, any>;

type Callbacks = Record<string, AnyActiveCallback | undefined>;

type ConversationRelatedData = {
  conversation: ClientSideChatConversation<ChatAgent>;
  callbacks: Callbacks;
};

// Helper function for propagating the "Agent" type into the store
function makeConversationStore() {
  return create(
    combine(
      {
        conversations: {} as Record<string, ConversationRelatedData | undefined>,
      },
      (set, get) => {
        let callbackKeyCounter = 0;
        const generateCallbackKey = () => {
          callbackKeyCounter += 1;
          return callbackKeyCounter.toString();
        };

        const getConversation = (conversationId: string) => {
          return get().conversations[conversationId]?.conversation;
        };

        const produceData = (fn: (data: Draft<ReturnType<typeof get>>) => void) => {
          set((state) => produce(state, fn));
        };

        const setConversationData = (
          conversationId: string,
          conversationData: ClientSideConversationData<AgentTools<ChatAgent>>
        ) => {
          // Forcing a new instance/reference each time here
          const conversation = new ClientSideChatConversation(conversationData);

          produceData((state) => {
            if (!state.conversations[conversationId]) {
              state.conversations[conversationId] = castDraft({ conversation, callbacks: {} });
            } else {
              state.conversations[conversationId].conversation = castDraft(conversation);
            }
          });
        };

        const getCallbacks = (conversationId: string) => {
          return get().conversations[conversationId]?.callbacks;
        };

        const addCallback = (conversationId: string, callbackKey: string, callback: AnyActiveCallback) => {
          produceData((state) => {
            if (!state.conversations[conversationId]) {
              return;
            }
            state.conversations[conversationId].callbacks[callbackKey] = castDraft(callback);
          });
        };

        const removeCallback = (conversationId: string, callbackKey: string) => {
          produceData((state) => {
            if (!state.conversations[conversationId]) {
              return;
            }
            delete state.conversations[conversationId].callbacks[callbackKey];
          });
        };

        return {
          mutate: {
            processClientEvent: (event: ClientSideUpdate) => {
              if (event.kind === 'sync-conversation') {
                const { conversationId, conversationData } = event;
                const existingConversation = getConversation(conversationId);
                if (existingConversation) {
                  // If an existing conversation exists, merge the data so that references are
                  // preserved if the underlying data is the same
                  existingConversation.mergeInNewData(conversationData);

                  // Force update the reference
                  setConversationData(conversationId, existingConversation.data);
                } else {
                  setConversationData(conversationId, conversationData);
                }
              } else if (event.kind === 'request-callback-response') {
                const key = generateCallbackKey();
                addCallback(event.conversationId, key, {
                  conversationId: event.conversationId,
                  messageId: event.messageId,
                  toolCallId: event.toolCallId,
                  callbackId: event.callbackId,
                  callbackName: event.callbackName,
                  toolName: event.toolName,
                  args: event.requestArgs,
                  remove: () => {
                    removeCallback(event.conversationId, key);
                  },
                });
              } else {
                const conversation = getConversation(event.conversationId);
                if (!conversation) {
                  console.error(`No conversation found for conversation ID ${event.conversationId}`);
                  return;
                }

                const oldData = conversation.data;
                conversation.processMessageUpdate(event);

                if (oldData !== conversation.data) {
                  // Change the class instance if the data instance has changed.
                  // This helps with state related stuff.
                  setConversationData(event.conversationId, conversation.data);
                }
              }
            },
            isConversationPresent: (conversationId: string) => {
              return !!getConversation(conversationId);
            },
            setConversationIfNotPresent: (
              conversationId: string,
              conversation: ClientSideChatConversation<ChatAgent>
            ) => {
              if (!getConversation(conversationId)) {
                setConversationData(conversationId, conversation.data);
              }
            },
            clearCallbacksForConversation: (conversationId: string) => {
              produceData((state) => {
                if (!state.conversations[conversationId]) {
                  return;
                }
                state.conversations[conversationId].callbacks = {};
              });
            },
          },
          get: {
            conversation: (conversationId: string) => {
              return getConversation(conversationId);
            },
            conversationCallbacks: (conversationId: string) => {
              return getCallbacks(conversationId);
            },
          },
        };
      }
    )
  );
}

export const useConversationStore = makeConversationStore();