import type { ChatTree, ClientSideUpdate } from '../common/types';
import type { AdvancedReactAgent } from '../server/advancedReactAgent';
import { create } from 'zustand';
import { combine } from 'zustand/middleware';
import { ClientSideChatConversation } from '../common/types';
import { mergeKeepingOldReferences } from './merge';
import { castDraft, Draft, produce } from 'immer';

type ActiveCallback<ToolName extends string, CallbackName extends string, ToolArgs, ResponseType> = {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  callbackId: string;
  callbackName: CallbackName;
  toolName: ToolName;
  args: ToolArgs;
  remove: (response: ResponseType) => void;
};

type ActiveCallbackWithResponse<ToolName extends string, CallbackName extends string, ToolArgs, ResponseType> = Omit<
  ActiveCallback<ToolName, CallbackName, ToolArgs, ResponseType>,
  'remove'
> & {
  respond: (response: ResponseType) => void;
};

type AnyActiveCallback = ActiveCallback<string, string, any, any>;

type Callbacks = Record<string, AnyActiveCallback | undefined>;

type ConversationRelatedData = {
  conversation: ClientSideChatConversation<AdvancedReactAgent>;
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

        const setConversation = (
          conversationId: string,
          conversation: ClientSideChatConversation<AdvancedReactAgent>
        ) => {
          produceData((state) => {
            if (!state.conversations[conversationId]) {
              state.conversations[conversationId] = castDraft({ conversation, callbacks: {} });
            } else {
              state.conversations[conversationId].conversation = castDraft(conversation);
            }
          });
        };

        const getCallbacks = (conversationId: string) => {
          return get().conversations[conversationId]?.callbacks ?? {};
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
                  const merged = mergeKeepingOldReferences(existingConversation.data, conversationData);
                  setConversation(conversationId, new ClientSideChatConversation(merged));
                } else {
                  setConversation(conversationId, new ClientSideChatConversation(conversationData));
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
                  setConversation(event.conversationId, new ClientSideChatConversation(conversation.data));
                }
              }
            },
            isConversationPresent: (conversationId: string) => {
              return !!getConversation(conversationId);
            },
            setConversationIfNotPresent: (
              conversationId: string,
              conversation: ClientSideChatConversation<AdvancedReactAgent>
            ) => {
              if (!getConversation(conversationId)) {
                setConversation(conversationId, conversation);
              }
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

export function mapActiveCallbackAddResponse<
  ToolName extends string,
  CallbackName extends string,
  ToolArgs,
  ResponseType,
>(
  callback: ActiveCallback<ToolName, CallbackName, ToolArgs, ResponseType>,
  respond: (response: ResponseType) => Promise<void>
): ActiveCallbackWithResponse<ToolName, CallbackName, ToolArgs, ResponseType> {
  return {
    ...callback,
    respond,
  };
}
