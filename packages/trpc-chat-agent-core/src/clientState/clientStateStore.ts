import type { ReadonlySignal } from '@preact/signals-core';
import type { createTRPCProxyClient } from '@trpc/client';
import type { z } from 'zod';
import type {
  AdvancedAIMessageDataClientSide,
  AdvancedAIMessageDataPartClientSide,
  AgentTools,
  AnyStructuredChatTool,
  ChatAgent,
  ChatAgentOrTools,
  ChatBranchState as ChatPathState,
  ChatTreePath,
  ClientSideConversationData,
  ClientSideUpdate,
  HumanMessageData,
  MessageContent,
  ToolCallState,
} from '../common';
import type { AnyToolCallback, makeChatRouterForAgent } from '../server';
import { computed, effect, signal } from '@preact/signals-core';
import { produce } from 'immer';
import { ClientSideChatConversation, ConversationBranchState } from '../common';
import { mergeKeepingOldReferences } from '../common/merge';
import { UnreachableError } from '../common/unreachable';

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

export type RouterTypeFromAgent<Agent extends ChatAgentOrTools> = ReturnType<
  typeof createTRPCProxyClient<ReturnType<typeof makeChatRouterForAgent<ChatAgent<AgentTools<Agent>>, any>>>
>;

type ConversationRelatedData = {
  conversation: ClientSideChatConversation<ChatAgentOrTools>;
  callbacks: Callbacks;
};

type PotentialConversationRelatedData =
  | {
      kind: 'loaded';
      data: ConversationRelatedData;
    }
  | {
      kind: 'loading';
      data: undefined;
    }
  | {
      kind: 'missing';
      data: undefined;
    };

type AllConversations = {
  [conversationId: string]: PotentialConversationRelatedData | undefined;
};

export function createSystemStateStore() {
  const state = signal<AllConversations>({});

  let callbackKeyCounter = 0;
  function generateCallbackKey() {
    callbackKeyCounter++;
    return callbackKeyCounter.toString();
  }

  function getConversation<Agent extends ChatAgentOrTools>(conversationId: string) {
    return state.value[conversationId]?.data?.conversation as ClientSideChatConversation<Agent> | undefined;
  }

  function getConversationState(conversationId: string) {
    return state.value[conversationId]?.kind;
  }

  function setConversationData(
    conversationId: string,
    conversationData: ClientSideConversationData<AgentTools<ChatAgentOrTools>>
  ) {
    const newConversation = new ClientSideChatConversation(conversationData);

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

  function setConversationIfNotPresent(
    conversationId: string,
    newConversation: ClientSideChatConversation<ChatAgentOrTools>
  ) {
    if (!getConversation(conversationId)) {
      setConversationData(conversationId, newConversation.data);
    }
  }

  function triggerConversationLoad(
    conversationId: string,
    resolver: Promise<ClientSideConversationData<AgentTools<ChatAgentOrTools>>>
  ) {
    if (!state.value[conversationId]) {
      state.value[conversationId] = {
        kind: 'loading',
        data: undefined,
      };
    }
    resolver.then((data) => {
      setConversationData(conversationId, data);
    });
  }

  return {
    state,
    getConversation,
    getConversationState,
    setConversationData,
    clearCallbacksForConversation,
    processConversationUpdate,
    getCallbacks,
    setConversationIfNotPresent,
    triggerConversationLoad,
  };
}

export type SystemStateStore = ReturnType<typeof createSystemStateStore>;

type CreateSystemStateStoreSubscriberArgs<Agent extends ChatAgentOrTools> = {
  store: SystemStateStore;
  router: RouterTypeFromAgent<Agent>;
  initialConversationId?: string;
  initialPath?: ChatTreePath;
  onUpdateConversationId?: (conversationId: string) => void;
};

export function createSystemStateStoreSubscriber<Agent extends ChatAgentOrTools>(
  args: CreateSystemStateStoreSubscriberArgs<Agent>
) {
  type Tools = AgentTools<Agent>;

  const { store, router: typedRouter, initialConversationId, initialPath, onUpdateConversationId } = args;
  const router = typedRouter as RouterTypeFromAgent<ChatAgentOrTools>; // There are cases where this is better, due to generic typing

  const branchState = signal(ConversationBranchState.default());

  function adjustPathFromConversationAndPath(conversation: ClientSideConversationData, path?: ChatTreePath) {
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
        })
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
    },
    onComplete: () => {
      if (conversationId.value) {
        // Ensure there's no stale callbacks laying around
        store.clearCallbacksForConversation(conversationId.value);
      }
    },
  });

  const placeholderConversation = signal(ClientSideChatConversation.makePlaceholderConversation<Agent>());

  // Get either the current or the placeholder conversation
  const conversation = computed(() => {
    if (conversationId.value) {
      const conversation = store.getConversation<Agent>(conversationId.value);
      if (conversation) {
        return conversation as ClientSideChatConversation<Agent>;
      }
    }
    return placeholderConversation.value as ClientSideChatConversation<Agent>;
  });

  const callbacks = computed(() => {
    if (conversationId.value) {
      return store.getCallbacks(conversationId.value) ?? {};
    }
    return {};
  });

  const callbackCache = makeItemCache<AnyActiveCallbackWithResponse>();
  const editMsgClosureCache = makeItemCache<(content: string) => void>();
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
    part: AdvancedAIMessageDataPartClientSide<Tools>,
    callbacks: AnyActiveCallbackWithResponse[]
  ): ChatAIMessagePart<Tools> => {
    return {
      ...part,
      toolCalls: part.toolCalls.map((toolCall) => ({
        ...toolCall,
        callbacks: callbacks.filter((c) => c.toolCallId === toolCall.id) as any, // Any necessary because of the ForceKeyToBeString hack
      })),
    };
  };

  const mapAiMessageAddCallbacks = (
    message: AdvancedAIMessageDataClientSide<Tools>,
    callbacks: AnyActiveCallbackWithResponse[]
  ): ChatAIMessage<Tools> => {
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
        regenerateMessage(message.id);
      }),
      path: {
        ...path,
        switchTo: switchPathMsgClosureCache.get(message.id, () => (index: number) => {
          switchMessagePathIndex(message.id, index);
        }),
      },
    };
  };

  const mapHumanMessageAddCallbacks = (message: HumanMessageData): ChatHumanMessage => {
    const path = conversation.value.getPathInfoForMessageId(message.id);
    return {
      ...message,
      edit: editMsgClosureCache.get(message.id, () => (content: string) => {
        editMessage(message.id, content);
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
    const rawMessages = conversation.value.asMessagesArray(branchState.value.selectedPath);

    callbackCache.resetUsage();
    editMsgClosureCache.resetUsage();
    regenerateMsgClosureCache.resetUsage();
    switchPathMsgClosureCache.resetUsage();

    const messagesMapped = rawMessages.map((message) => {
      if (message.kind === 'ai') {
        return mapAiMessageAddCallbacks(message, CallbacksMapped.value);
      }
      if (message.kind === 'human') {
        return mapHumanMessageAddCallbacks(message);
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

      if (conversationState === 'loading') {
        throw new Error('Cannot start a new message while the conversation is loading');
      }
      if (conversationState === 'missing') {
        throw new Error('Cannot start a new message while the conversation is missing');
      }
    }
  };

  const beginMessage = (humanMessage: string) => {
    assertCanBeginStream();

    // Set the placeholder conversation, in case the conversation doesn't exist yet
    const newPlaceholderConversation = ClientSideChatConversation.makePlaceholderConversation<Agent>();
    newPlaceholderConversation.pushHumanAiMessagePair(
      [],
      {
        content: humanMessage,
        id: '-human-placeholder-',
        kind: 'human',
      },
      {
        id: '-ai-placeholder-',
        kind: 'ai',
        parts: [],
      }
    );
    placeholderConversation.value = newPlaceholderConversation;

    beginStream(conversationId.peek(), humanMessage, branchState.peek().selectedPath);
  };

  const editMessage = (humanMessageId: string, message: string) => {
    assertCanBeginStream();

    const path = branchState.peek().getPathToHumanMessage(humanMessageId);
    beginStream(conversationId.peek(), message, path);
  };

  const regenerateMessage = (aiMessageId: string) => {
    assertCanBeginStream();

    const path = branchState.peek().getPathToAiMessage(aiMessageId);
    beginStream(conversationId.peek(), null, path);
  };

  return {
    conversation,
    messages: pastMappedMessages,
    beginMessage,
    isStreaming,
    cancelStream,
    conversationId,
    conversationError,
    isLoadingConversation: computed(() => {
      const id = conversationId.peek();
      if (!id) {
        return false;
      }
      return store.getConversationState(id) === 'loading';
    }),
    isMissingConversation: computed(() => {
      const id = conversationId.peek();
      if (!id) {
        return false;
      }
      return store.getConversationState(id) === 'missing';
    }),
  };
}

type SignalValue<T extends ReadonlySignal<any>> = T extends ReadonlySignal<infer V> ? V : never;

function makeConversationStreamerState<Agent extends ChatAgentOrTools>(
  router: RouterTypeFromAgent<Agent>,
  callbacks: { onUpdate: (event: ClientSideUpdate) => void; onComplete: () => void }
) {
  const cancelCurrentStream = signal<(() => void) | undefined>(undefined);
  const conversationError = signal<Error | undefined>(undefined);

  const { onUpdate, onComplete } = callbacks;

  const cancelStream = () => {
    const cancel = cancelCurrentStream.peek();
    if (cancel) {
      cancel();
      cancelCurrentStream.value = undefined;
    }
  };

  const beginStream = (conversationId: string | undefined, humanMessage: string | null, branch: ChatTreePath) => {
    conversationError.value = undefined;

    cancelStream();

    const abort = new AbortController();

    const subscription = router.promptChat.subscribe(
      {
        conversationId,
        branch,
        humanMessageContent: humanMessage,
      },
      {
        onData: (updateEvent) => {
          if (updateEvent === null) {
            // Currently, trpc seems to be struggling to trigger "conversation complete".
            // Yielding null to signal the conversation is complete (manually handled client-side)
            subscription.unsubscribe();
            cancelCurrentStream.value = undefined;
            onComplete();
          } else {
            onUpdate(updateEvent);
          }
        },
        onComplete: () => {
          cancelCurrentStream.value = undefined;
          onComplete();
        },
        onError: (err) => {
          conversationError.value = err;
          cancelStream();
        },
        signal: abort.signal,
      }
    );

    cancelCurrentStream.value = () => {
      abort.abort();
      subscription.unsubscribe();
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

export type ChatAIMessage<AgentOrTools extends ChatAgentOrTools> = {
  kind: 'ai';
  id: string;
  parts: ChatAIMessagePart<AgentOrTools>[];
  path: ChatPathStateWithSwitch;
  regenerate: () => void;
};

export type ChatHumanMessage = HumanMessageData & {
  path: ChatPathStateWithSwitch;
  edit: (content: string) => void;
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
