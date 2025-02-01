import type { ReadonlySignal } from '@preact/signals-core';
import type { createTRPCClient } from '@trpc/client';
import type { z } from 'zod';
import type {
  AgentExtraArgs,
  AgentTools,
  AIMessageData,
  AIMessageDataClientSide,
  AIMessageDataPartClientSide,
  AnyChatAgent,
  AnyStructuredChatTool,
  ChatAgentOrTools,
  ChatBranchState as ChatPathState,
  ChatTreePath,
  ClientSideConversation,
  ClientSideUpdate,
  MessageContent,
  ToolCallState,
  UserMessageData,
} from '../common';
import type { AnyToolCallback, makeChatRouterForAgent } from '../server';
import { computed, effect, signal } from '@preact/signals-core';
import { produce } from 'immer';
import { ClientSideChatConversationHelper, ConversationBranchState, Debouncer } from '../common';
import { mergeKeepingOldReferences } from '../common/merge';
import { UnreachableError } from '../common/unreachable';
import { ConversationStorage } from './conversationStorage';

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

export type RouterTypeFromAgent<Agent extends AnyChatAgent> = ReturnType<
  typeof createTRPCClient<ReturnType<typeof makeChatRouterForAgent<Agent, any>>>
>;

type ConversationRelatedData = {
  conversation: ClientSideChatConversationHelper<ChatAgentOrTools>;
  callbacks: Callbacks;
};

type PotentialConversationRelatedData =
  | {
      kind: 'loaded';
      data: ConversationRelatedData;
    }
  | {
      kind: 'loading';
      data: ConversationRelatedData | undefined;
    }
  | {
      kind: 'missing';
      data: undefined;
    }
  | {
      kind: 'error';
      data: undefined;
      error: unknown;
    };

type AllConversations = {
  [conversationId: string]: PotentialConversationRelatedData | undefined;
};

export function createSystemStateStore() {
  const state = signal<AllConversations>({});

  const localCacheDb = ConversationStorage.create();
  const getLocalDb = () => {
    return localCacheDb;
  };

  const getConversationFromCache = async (conversationId: string) => {
    const localDb = await getLocalDb();
    const data = await localDb.getConversation(conversationId);
    return data;
  };

  let callbackKeyCounter = 0;
  function generateCallbackKey() {
    callbackKeyCounter++;
    return callbackKeyCounter.toString();
  }

  function getConversation<Agent extends ChatAgentOrTools>(conversationId: string) {
    return state.value[conversationId]?.data?.conversation as ClientSideChatConversationHelper<Agent> | undefined;
  }

  function getConversationState(conversationId: string) {
    return state.value[conversationId];
  }

  function setConversationData(
    conversationId: string,
    conversationData: ClientSideConversation<AgentTools<ChatAgentOrTools>>
  ) {
    const newConversation = new ClientSideChatConversationHelper(conversationData);

    state.value = produce(state.value, (draft) => {
      if (!draft[conversationId] || draft[conversationId]!.kind !== 'loaded') {
        draft[conversationId] = {
          kind: 'loaded',
          data: {
            conversation: newConversation,
            callbacks: {},
          },
        };
      } else {
        draft[conversationId]!.data.conversation = newConversation;
      }
    });
  }

  function addCallback(conversationId: string, callbackKey: string, callback: AnyActiveCallback) {
    state.value = produce(state.value, (draft) => {
      const convo = draft[conversationId];
      if (!convo?.data) {
        return;
      }
      convo.data.callbacks[callbackKey] = callback;
    });
  }

  function removeCallback(conversationId: string, callbackKey: string) {
    state.value = produce(state.value, (draft) => {
      const convo = draft[conversationId];
      if (!convo?.data) {
        return;
      }
      delete convo.data.callbacks[callbackKey];
    });
  }

  function clearCallbacksForConversation(conversationId: string) {
    state.value = produce(state.value, (draft) => {
      const convo = draft[conversationId];
      if (convo?.data) {
        convo.data.callbacks = {};
      }
    });
  }

  function processConversationUpdate(event: ClientSideUpdate) {
    if (event.kind === 'sync-conversation') {
      const { conversationData } = event;
      const existingConversation = getConversation(event.conversationId);
      if (existingConversation) {
        existingConversation.mergeInNewData(conversationData);
        setConversationData(event.conversationId, existingConversation.data);
      } else {
        setConversationData(event.conversationId, conversationData);
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
        remove: () => removeCallback(event.conversationId, key),
      });
    } else {
      const conversation = getConversation(event.conversationId);
      if (!conversation) {
        console.error(`No conversation found for ID ${event.conversationId}`);
        return;
      }
      const oldData = conversation.data;
      conversation.processMessageUpdate(event);
      if (oldData !== conversation.data) {
        setConversationData(event.conversationId, conversation.data);
      }
    }
  }

  function getCallbacks(conversationId: string) {
    return state.value[conversationId]?.data?.callbacks;
  }

  function triggerConversationLoad(
    conversationId: string,
    resolver: Promise<ClientSideConversation<AgentTools<ChatAgentOrTools>> | null>,
    useCache: boolean
  ) {
    const existingConversation = getConversation(conversationId);

    // If we have a conversation locally already, continue using it as the loading placeholder
    state.value = produce(state.value, (draft) => {
      draft[conversationId] = {
        kind: 'loading',
        data: existingConversation && {
          conversation: existingConversation,
          callbacks: {},
        },
      };
    });

    if (useCache) {
      const cachedConversationPromise = getConversationFromCache(conversationId);
      cachedConversationPromise.then((data) => {
        if (data) {
          // If our conversation state is still loading, set the cached data
          if (state.value[conversationId]?.kind === 'loading') {
            state.value = produce(state.value, (draft) => {
              draft[conversationId] = {
                kind: 'loading',
                data: {
                  conversation: new ClientSideChatConversationHelper(data),
                  callbacks: {},
                },
              };
            });
          }
        }
      });
    }

    resolver
      .then((data) => {
        if (!data) {
          state.value = produce(state.value, (draft) => {
            draft[conversationId] = {
              kind: 'missing',
              data: undefined,
            };
          });
        } else {
          setConversationData(conversationId, data);
          saveConversationToCache(conversationId);
        }
      })
      .catch((err) => {
        state.value = produce(state.value, (draft) => {
          draft[conversationId] = {
            kind: 'error',
            data: undefined,
            error: err,
          };
        });
      });
  }

  async function saveConversationToCache(conversationId: string) {
    const db = await getLocalDb();
    const data = getConversation(conversationId)?.data;
    if (data) {
      await db.saveConversation(data);
    }
  }

  return {
    state,
    getConversation,
    getConversationState,
    setConversationData,
    clearCallbacksForConversation,
    processConversationUpdate,
    saveConversationToCache,
    getCallbacks,
    triggerConversationLoad,
  };
}

export type SystemStateStore = ReturnType<typeof createSystemStateStore>;

export type ExtraArgsFields<FieldName extends string, Agent extends AnyChatAgent> =
  AgentExtraArgs<Agent> extends never | undefined
    ? { [key in FieldName]?: undefined }
    : {
        [key in FieldName]: AgentExtraArgs<Agent>;
      };

type CreateSystemStateStoreSubscriberArgs<Agent extends AnyChatAgent> = {
  store: SystemStateStore;
  router: RouterTypeFromAgent<Agent>;
  initialConversationId?: string;
  initialPath?: ChatTreePath;
  onUpdateConversationId?: (conversationId: string) => void;
  useIndexdbCache?: boolean;
} & ExtraArgsFields<'initialExtraArgs', Agent>;

export function createSystemStateStoreSubscriber<Agent extends AnyChatAgent>(
  args: CreateSystemStateStoreSubscriberArgs<Agent>
) {
  type Tools = AgentTools<Agent>;

  const {
    store,
    router: typedRouter,
    initialConversationId,
    initialPath,
    onUpdateConversationId,
    useIndexdbCache: useIndexdbCacheOptional,
    initialExtraArgs,
  } = args;
  const useIndexdbCache = useIndexdbCacheOptional ?? true;

  const router = typedRouter as RouterTypeFromAgent<Agent>; // There are cases where this is better, due to generic typing

  const branchState = signal(ConversationBranchState.default());

  const extraArgs = signal<AgentExtraArgs<Tools>>(initialExtraArgs);

  // Cache every 500ms to indexdb (but only when there's new updates)
  const cacheConversationDebouncer = new Debouncer<void>(500, () => {
    const id = conversationId.value;
    if (id) {
      store.saveConversationToCache(id);
    }
  });

  function adjustPathFromConversationAndPath(conversation: ClientSideConversation, path?: ChatTreePath) {
    let updatedBranch = branchState.value.withConversationData(conversation);
    if (path) {
      updatedBranch = updatedBranch.withBranchSelected(path);
    }
    branchState.value = updatedBranch;
  }

  function switchMessagePathIndex(messageId: string, index: number) {
    branchState.value = branchState.peek().withMessageIndex(messageId, index);
  }

  // Trigger loading the conversation if we know the conversation ID
  if (initialConversationId) {
    const conversation = store.getConversation(initialConversationId);
    if (!conversation) {
      store.triggerConversationLoad(
        initialConversationId,
        router.getChat.query({
          conversationId: initialConversationId,
          extraArgs: extraArgs.peek(),
        }) as Promise<ClientSideConversation<any[]>>,
        useIndexdbCache
      );

      // Create a "conversation loaded" listener to adjust things like the branch state
      let adjustedInitialBranch = false;
      const unsubscribe = effect(() => {
        const updatedConversation = store.getConversation(initialConversationId);
        if (!adjustedInitialBranch && !!updatedConversation) {
          adjustedInitialBranch = true;
          adjustPathFromConversationAndPath(updatedConversation.data, initialPath);
          unsubscribe();
        }
      });
    } else {
      adjustPathFromConversationAndPath(conversation.data, initialPath);
    }
  }

  const conversationId = signal(initialConversationId);

  const { beginStream, cancelStream, isStreaming, conversationError } = makeConversationStreamerState(router, {
    onUpdate: (update) => {
      store.processConversationUpdate(update);

      if (update.kind === 'sync-conversation') {
        adjustPathFromConversationAndPath(update.conversationData, update.path);
      }

      // Ensure the conversation ID is in sync. For example, when
      // the ID was undefined, but a new conversation was created
      if (conversationId.value !== update.conversationId) {
        onUpdateConversationId?.(update.conversationId);
        conversationId.value = update.conversationId;
      }

      if (useIndexdbCache) {
        cacheConversationDebouncer.debounce();
      }
    },
    onComplete: () => {
      if (conversationId.value) {
        // Ensure there's no stale callbacks laying around
        store.clearCallbacksForConversation(conversationId.value);
      }
    },
  });

  // Get either the current or the placeholder conversation
  const conversation = computed(() => {
    if (conversationId.value) {
      const conversation = store.getConversation<Agent>(conversationId.value);
      if (conversation) {
        return conversation as ClientSideChatConversationHelper<Agent>;
      }
    }

    return placeholderConversation.value as ClientSideChatConversationHelper<Agent>;
  });

  const placeholderConversation = signal(ClientSideChatConversationHelper.makePlaceholderConversation<Agent>());

  const callbacks = computed(() => {
    if (conversationId.value) {
      return store.getCallbacks(conversationId.value) ?? {};
    }
    return {};
  });

  const callbackCache = makeItemCache<AnyActiveCallbackWithResponse>();
  const editMsgClosureCache = makeItemCache<(args: { content: string }) => void>();
  const regenerateMsgClosureCache = makeItemCache<() => void>();
  const switchPathMsgClosureCache = makeItemCache<(index: number) => void>();

  const CallbacksMapped = computed(() => {
    return Object.values(callbacks.value)
      .filter((c) => !!c) // Necessary to please typescript
      .map((c) =>
        mapActiveCallbackAddResponse(c, async (response) => {
          await router.handleCallback.mutate({
            conversationId: c.conversationId,
            messageId: c.messageId,
            toolCallId: c.toolCallId,
            callbackId: c.callbackId,
            callbackArgs: response,
          });
          c.remove();
        })
      );
  });

  const mapAiMessagePartAddCallbacks = (
    part: AIMessageDataPartClientSide<Tools>,
    callbacks: AnyActiveCallbackWithResponse[]
  ): ChatAIMessagePart<Agent> => {
    return {
      ...part,
      toolCalls: part.toolCalls.map((toolCall) => ({
        ...toolCall,
        callbacks: callbacks.filter((c) => c.toolCallId === toolCall.id) as any, // Any necessary because of the ForceKeyToBeString hack
      })),
    };
  };

  const mapAiMessageAddCallbacks = (
    message: AIMessageDataClientSide<Tools>,
    callbacks: AnyActiveCallbackWithResponse[]
  ): ChatAIMessage<Agent> => {
    const path = conversation.value.getPathInfoForMessageId(message.id);
    return {
      ...message,
      parts: message.parts.map((part) =>
        mapAiMessagePartAddCallbacks(
          part,
          callbacks.filter((c) => c.messageId === message.id)
        )
      ),
      regenerate: regenerateMsgClosureCache.get(message.id, () => () => {
        regenerateMessage(message.id, {
          extraArgs: extraArgs.peek(),
        });
      }),
      path: {
        ...path,
        switchTo: switchPathMsgClosureCache.get(message.id, () => (index: number) => {
          switchMessagePathIndex(message.id, index);
        }),
      },
    };
  };

  const mapUserMessageAddCallbacks = (message: UserMessageData): ChatUserMessage => {
    const path = conversation.value.getPathInfoForMessageId(message.id);
    return {
      ...message,
      edit: editMsgClosureCache.get(message.id, () => (args) => {
        editMessage(message.id, {
          message: args.content,
          extraArgs: extraArgs.peek(),
        });
      }),
      path: {
        ...path,
        switchTo: switchPathMsgClosureCache.get(message.id, () => (index: number) => {
          switchMessagePathIndex(message.id, index);
        }),
      },
    };
  };

  const mappedMessages = computed(() => {
    const selectedPath = branchState.value.selectedPath;
    const rawMessages = conversation.value.asMessagesArray(selectedPath);

    callbackCache.resetUsage();
    editMsgClosureCache.resetUsage();
    regenerateMsgClosureCache.resetUsage();
    switchPathMsgClosureCache.resetUsage();

    const messagesMapped = rawMessages.map((message) => {
      if (message.kind === 'ai') {
        return mapAiMessageAddCallbacks(message, CallbacksMapped.value);
      }
      if (message.kind === 'user') {
        return mapUserMessageAddCallbacks(message);
      }

      throw new UnreachableError(message, 'Unknown message kind');
    });

    callbackCache.deleteUnused();
    editMsgClosureCache.deleteUnused();
    regenerateMsgClosureCache.deleteUnused();
    switchPathMsgClosureCache.deleteUnused();

    return messagesMapped;
  });

  // Attempt to preserve old references
  const pastMappedMessages = signal<SignalValue<typeof mappedMessages>>([]);
  effect(() => {
    pastMappedMessages.value = mergeKeepingOldReferences(pastMappedMessages.peek(), mappedMessages.value);
  });

  const assertCanBeginStream = () => {
    const currentId = conversationId.peek();
    if (currentId) {
      const conversationState = store.getConversationState(currentId);

      if (conversationState?.kind === 'loading') {
        throw new Error('Cannot start a new message while the conversation is loading');
      }
      if (conversationState?.kind === 'missing') {
        throw new Error('Cannot start a new message while the conversation is missing');
      }
      if (conversationState?.kind === 'error') {
        throw new Error('Cannot start a new message while the conversation is errored');
      }
    }
  };

  const beginMessage = (args: { userMessage: string }) => {
    assertCanBeginStream();
    beginStream({
      branch: branchState.peek().selectedPath,
      conversationId: conversationId.peek(),
      userMessage: args.userMessage,
      extraArgs: extraArgs.peek(),
    });

    let isUsingPlaceholder = false;
    let conversation =
      conversationId.peek() &&
      (store.getConversation(conversationId.peek()!) as ClientSideChatConversationHelper<Agent> | undefined);

    if (!conversation) {
      conversation = placeholderConversation.value;
      isUsingPlaceholder = true;
    }

    const dummyUserMessage: UserMessageData = {
      content: args.userMessage,
      id: '-user-placeholder-',
      kind: 'user',
      createdAt: new Date().toISOString(),
    };
    const dummyAIMessage: AIMessageData<AgentTools<Agent>> = {
      id: '-ai-placeholder-',
      kind: 'ai',
      parts: [],
      createdAt: new Date().toISOString(),
    };

    const currentPath = branchState.value.selectedPath;
    const newPath = conversation.pushUserAiMessagePair(currentPath, dummyUserMessage, dummyAIMessage);
    branchState.value = branchState.value.withConversationData(conversation.data).withBranchSelected(newPath);

    if (isUsingPlaceholder) {
      placeholderConversation.value = new ClientSideChatConversationHelper(conversation.data);
    } else {
      store.setConversationData(conversation.data.id, conversation.data);
    }
  };

  const editMessage = (userMessageId: string, args: { message: string; extraArgs: AgentExtraArgs<Agent> }) => {
    assertCanBeginStream();

    const path = branchState.peek().getPathToUserMessage(userMessageId);
    beginStream({
      branch: path,
      conversationId: conversationId.peek(),
      userMessage: args.message,
      extraArgs: args.extraArgs,
    });
  };

  const regenerateMessage = (aiMessageId: string, args: { extraArgs: AgentExtraArgs<Agent> }) => {
    assertCanBeginStream();

    const path = branchState.peek().getPathToAiMessage(aiMessageId);
    beginStream({
      branch: path,
      conversationId: conversationId.peek(),
      extraArgs: args.extraArgs,
      userMessage: null,
    });
  };

  return {
    conversation,
    messages: pastMappedMessages,
    beginMessage,
    isStreaming,
    cancelStream,
    conversationId,
    conversationError: computed(() => {
      if (conversationError.value) {
        return conversationError.value;
      }

      const currentConversationId = conversationId.value;
      if (!currentConversationId) {
        return undefined;
      }

      const state = store.getConversationState(currentConversationId);
      if (state?.kind === 'error') {
        return state.error;
      }

      return undefined;
    }),
    extraArgs,
    conversationPath: computed(() => branchState.value.selectedPath),
    isLoadingConversation: computed(() => {
      const id = conversationId.peek();
      if (!id) {
        return false;
      }
      return store.getConversationState(id)?.kind === 'loading';
    }),
    isMissingConversation: computed(() => {
      const id = conversationId.peek();
      if (!id) {
        return false;
      }
      return store.getConversationState(id)?.kind === 'missing';
    }),
  };
}

type SignalValue<T extends ReadonlySignal<any>> = T extends ReadonlySignal<infer V> ? V : never;

function makeConversationStreamerState<Agent extends AnyChatAgent>(
  router: RouterTypeFromAgent<Agent>,
  callbacks: { onUpdate: (event: ClientSideUpdate) => void; onComplete: () => void }
) {
  const cancelCurrentStream = signal<(() => void) | undefined>(undefined);
  const conversationError = signal<Error | undefined>(undefined);

  const { onUpdate, onComplete } = callbacks;

  const completeStream = () => {
    cancelCurrentStream.value = undefined;
    onComplete();
  };

  const cancelStream = () => {
    const cancel = cancelCurrentStream.peek();
    if (cancel) {
      cancel();
      completeStream();
    }
  };

  const beginStream = (args: {
    conversationId: string | undefined;
    userMessage: string | null;
    branch: ChatTreePath;
    extraArgs: AgentExtraArgs<Agent>;
  }) => {
    conversationError.value = undefined;

    cancelStream();

    const abort = new AbortController();

    const promptResponse = router.promptChat.mutate(
      {
        conversationId: args.conversationId,
        branch: args.branch,
        userMessageContent: args.userMessage,
        extraArgs: args.extraArgs,
      },
      {
        signal: abort.signal,
      }
    );

    const processEvents = async () => {
      const response = await promptResponse;
      const stream = response.stream;

      try {
        for await (const event of stream) {
          try {
            onUpdate(event);
          } catch (err) {
            console.error(err);
            break;
          }
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          conversationError.value = err as Error;
        }
        completeStream();
      } finally {
        completeStream();
      }
    };

    void processEvents();

    cancelCurrentStream.value = () => {
      abort.abort();
    };
  };

  return {
    beginStream,
    cancelStream,
    isStreaming: computed(() => !!cancelCurrentStream.value),
    conversationError: computed(() => conversationError.value), // Make it read-only
  };
}

function mapActiveCallbackAddResponse<ToolName extends string, CallbackName extends string, ToolArgs, ResponseType>(
  callback: ActiveCallback<ToolName, CallbackName, ToolArgs>,
  respond: (response: ResponseType) => Promise<void>
): ActiveCallbackWithResponse<ToolName, CallbackName, ToolArgs, ResponseType> {
  return {
    ...callback,
    respond,
  };
}

type ActiveCallbackWithResponse<ToolName extends string, CallbackName extends string, ToolArgs, ResponseType> = Omit<
  ActiveCallback<ToolName, CallbackName, ToolArgs>,
  'remove'
> & {
  respond: (response: ResponseType) => void;
};

export type AnyActiveCallbackWithResponse = ActiveCallbackWithResponse<string, string, any, any>;

function makeItemCache<T>() {
  const items = new Map<string, { used: boolean; item: T }>();

  return {
    resetUsage: () => {
      items.forEach((item) => (item.used = false));
    },
    deleteUnused: () => {
      const keys = Array.from(items.keys());
      for (const key of keys) {
        if (!items.get(key)?.used) {
          items.delete(key);
        }
      }
    },
    get: (key: string, create: () => T) => {
      const existing = items.get(key);
      if (existing) {
        existing.used = true;
        return existing.item;
      }
      const item = create();
      items.set(key, { used: true, item });
      return item;
    },
  };
}

export type ChatPathStateWithSwitch = ChatPathState & {
  index: number;
  count: number;
  switchTo: (index: number) => void;
};

type CallbackFromCallbackSchema<
  Tool extends AnyStructuredChatTool,
  CallbackName extends string,
  Callback extends AnyToolCallback,
> = ActiveCallbackWithResponse<
  Tool['TypeInfo']['Name'],
  CallbackName,
  z.infer<Callback['args']>,
  z.infer<Callback['response']>
>;

// This is annoyingly necessary, typescript doesn't seem to be smart enough
type ForceKeyToBeString<K extends string | number | symbol> = K extends string ? K : never;

type CallbacksFromToolCallbacks<Tool extends AnyStructuredChatTool> = {
  [K in keyof Tool['TypeInfo']['Callbacks']]: CallbackFromCallbackSchema<
    Tool,
    ForceKeyToBeString<K>,
    Tool['TypeInfo']['Callbacks'][K]
  >;
}[keyof Tool['TypeInfo']['Callbacks']];

type ChatToolCall<Tool extends AnyStructuredChatTool> = {
  id: string;

  name: Tool['TypeInfo']['Name'];

  // May or may not be present. The name is known first, then the preview args get sent along after
  args?: Tool['TypeInfo']['ArgsForClient'];
  // May or may not be present. May be sent along when the tool is being executed. Does not persist.
  progressStatus?: Tool['TypeInfo']['ToolProgress'];
  // May or may not be present. Generally present when the tool finishes executing.
  result?: Tool['TypeInfo']['ResultForClient'];
  state: ToolCallState;

  callbacks: CallbacksFromToolCallbacks<Tool>[];
};

type ChatAIMessageToolCallForTools<Tools extends readonly AnyStructuredChatTool[]> = {
  [K in keyof Tools]: ChatToolCall<Tools[K]>;
}[number];

export type ChatAIMessageToolCall<AgentOrTools extends ChatAgentOrTools> = ChatAIMessageToolCallForTools<
  AgentTools<AgentOrTools>
>;

export type ChatAIMessagePart<AgentOrTools extends ChatAgentOrTools> = {
  content: MessageContent;
  toolCalls: ChatAIMessageToolCall<AgentOrTools>[];
};

export type ChatAIMessage<Agent extends AnyChatAgent> = {
  kind: 'ai';
  id: string;
  parts: ChatAIMessagePart<Agent>[];
  path: ChatPathStateWithSwitch;
  regenerate: () => void;
};

export type ChatUserMessage = UserMessageData & {
  path: ChatPathStateWithSwitch;
  edit: (args: { content: string }) => void;
};

type GetToolByNameFromList<
  Name extends Tools[number]['TypeInfo']['Name'],
  Tools extends readonly AnyStructuredChatTool[],
> = {
  [K in keyof Tools]: Tools[K]['TypeInfo']['Name'] extends Name ? Tools[K] : never;
}[number];

export type GetToolByName<
  Name extends AgentTools<AgentOrTools>[number]['TypeInfo']['Name'],
  AgentOrTools extends ChatAgentOrTools,
> = GetToolByNameFromList<Name, AgentTools<AgentOrTools>>;
