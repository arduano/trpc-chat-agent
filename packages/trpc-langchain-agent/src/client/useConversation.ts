import type { MessageContent } from '@langchain/core/messages';
import type { createTRPCProxyClient } from '@trpc/client';
import type { z } from 'zod';
import type { AgentTools, AnyStructuredChatTool, ChatAgent } from '../common';
import type {
  AdvancedAIMessageDataClientSide,
  AdvancedAIMessageDataPartClientSide,
  ChatTree,
  ClientSideUpdate,
  ToolCallState,
} from '../common/types';
import type { AnyToolCallback, makeChatRouterForAgent } from '../server';
import type { ActiveCallback } from './clientConversationStore';
import { useEffect, useMemo, useState } from 'react';
import { ClientSideChatConversation } from '../common/types';
import { useConversationStore } from './clientConversationStore';
import useKeyedMemo from './useKeyedMemo';
import { useRefValue } from './useRefValue';

type UseConversationArgs<Agent extends ChatAgent> = {
  conversationId?: string;
  router: RouterTypeFromAgent<Agent>;
  onUpdateConversationId?: (conversationId: string) => void;
};
export function useConversation<Agent extends ChatAgent>({
  conversationId,
  router,
  onUpdateConversationId,
}: UseConversationArgs<Agent>) {
  type Tools = AgentTools<Agent>;

  // Use the mutation functions in the store
  const store = useConversationStore((data) => data.mutate);
  const conversationFromStore = useConversationStore((data) =>
    conversationId === undefined ? undefined : data.get.conversation(conversationId)
  );
  const callbacks =
    useConversationStore((data) =>
      conversationId === undefined ? undefined : data.get.conversationCallbacks(conversationId)
    ) ?? {};

  const [branch, setBranch] = useState<ChatTree>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(conversationId);

  const [isConversationMissing, setIsConversationMissing] = useState(false);

  const [placeholderConversation, setPlaceholderConversation] = useState<ClientSideChatConversation<Agent>>(() =>
    ClientSideChatConversation.makePlaceholderConversation<Agent>()
  );

  const currentConversationIdRef = useRefValue(currentConversationId); // Necessary to make sure the stream callback doesn't use the stale conversation ID
  const { beginStream, cancelStream, isStreaming } = useConversationStreamer(router, {
    onUpdate: (update) => {
      store.processClientEvent(update);

      if (update.kind === 'sync-conversation') {
        setBranch(update.branch);
      }

      // Ensure the conversation ID is in sync. For example, when
      // the ID was undefined, but a new conversation was created
      if (currentConversationIdRef.current !== update.conversationId) {
        onUpdateConversationId?.(update.conversationId);
        setCurrentConversationId(update.conversationId);
      }
    },
    onComplete: () => {
      if (currentConversationIdRef.current) {
        // Ensure there's no stale callbacks laying around
        store.clearCallbacksForConversation(currentConversationIdRef.current);
      }
    },
  });

  useEffect(() => {
    // Help make sure the conversation is in sync.
    // If the ID changes in an unexpected way, reset the chat.
    if (currentConversationId !== conversationId) {
      cancelStream();
      setCurrentConversationId(conversationId);
      setBranch([]);
      setPlaceholderConversation(ClientSideChatConversation.makePlaceholderConversation<Agent>());
    }

    // Query the conversation to insert into the store if not present
    setIsConversationMissing(false);
    if (conversationId && !store.isConversationPresent(conversationId)) {
      router.getChat
        .query({ conversationId })
        .then((conversation) => {
          if (!conversation) {
            setIsConversationMissing(true);
          } else {
            const conversationClass = new ClientSideChatConversation(
              conversation as any // Necessary because of deeply nested typescript generic issues
            );
            store.setConversationIfNotPresent(conversationId, conversationClass);
            setBranch(conversationClass.getDefaultTree());
          }
        })
        .catch(() => {
          setIsConversationMissing(true);
        });
    }
  }, [conversationId]);

  // Is loading when the conversation isn't guaranteed to be missing,
  // and the conversation isn't present in the store
  const isLoadingConversation = !isConversationMissing && conversationId && !conversationFromStore;

  // Can start a new message when the conversation isn't guaranteed to be missing,
  // And when it's not loading
  const canStartNewMessage = !isConversationMissing && !isLoadingConversation;

  // Use the current conversation
  const conversation = (conversationFromStore ?? placeholderConversation) as ClientSideChatConversation<Agent>;

  const activeAiMessageId = useMemo(() => conversation.getAIMessageIdAt(branch), [branch, conversation]);

  const activeCallbacks = useMemo(
    () =>
      Object.values(callbacks)
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
        ),
    [activeAiMessageId, callbacks]
  );

  const mapAiMessagePartAddActiveCallbacks = (
    part: AdvancedAIMessageDataPartClientSide<Tools>,
    activeCallbacks: AnyActiveCallbackWithResponse[]
  ): AdvancedAIMessageDataPartClientSideWithCallbacks<Tools> => {
    return {
      ...part,
      toolCalls: part.toolCalls.map((toolCall) => ({
        ...toolCall,
        callbacks: activeCallbacks.filter((c) => c.toolCallId === toolCall.id) as any, // Any necessary because of the ForceKeyToBeString hack
      })),
    };
  };

  const mapAiMessageAddActiveCallbacks = (
    message: AdvancedAIMessageDataClientSide<Tools>,
    activeCallbacks: AnyActiveCallbackWithResponse[]
  ): AdvancedAIMessageDataClientSideWithCallbacks<Tools> => {
    return {
      ...message,
      parts: message.parts.map((part) =>
        mapAiMessagePartAddActiveCallbacks(
          part,
          activeCallbacks.filter((c) => c.messageId === message.id)
        )
      ),
    };
  };

  const beginMessage = (humanMessage: string) => {
    if (!canStartNewMessage) {
      if (isLoadingConversation) {
        throw new Error('Cannot start a new message while the conversation is loading');
      }
      if (isConversationMissing) {
        throw new Error('Cannot start a new message while the conversation is missing');
      }
      throw new Error('Cannot start a new message');
    }

    // Set the placeholder conversation, in case the conversation doesn't exist yet
    const placeholderConversation = ClientSideChatConversation.makePlaceholderConversation<Agent>();
    placeholderConversation.pushHumanAiMessagePair(
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
    setPlaceholderConversation(placeholderConversation);

    beginStream(conversationId, humanMessage, branch);
  };

  const messages = useMemo(() => {
    return conversation.asMessagesArray(branch);
  }, [conversation, branch]);

  // A custom array-based memo hook to preserve item instances when the source item hasn't changed
  const messagesWithCallbacks = useKeyedMemo(
    messages,

    // The cache key: message ID plus the active callback IDs on that message
    (message) =>
      [message.id, ...activeCallbacks.filter((c) => c.messageId === message.id).map((c) => c.callbackId)].join(';'),

    // The mapping function
    (message) => (message.kind === 'human' ? message : mapAiMessageAddActiveCallbacks(message, activeCallbacks))
  );

  return {
    beginMessage,
    messages: messagesWithCallbacks,
    isStreaming,
    cancelStream,
    isLoadingConversation,
    isConversationMissing,
  };
}

function useConversationStreamer<Agent extends ChatAgent>(
  router: RouterTypeFromAgent<Agent>,
  callbacks: { onUpdate: (event: ClientSideUpdate) => void; onComplete: () => void }
) {
  const [cancelCurrentStream, setCancelCurrentStream] = useState<(() => void) | undefined>(undefined);
  const { onUpdate, onComplete } = callbacks;

  const cancelStream = () => {
    if (cancelCurrentStream) {
      cancelCurrentStream();
      setCancelCurrentStream(undefined);
    }
  };

  const beginStream = (conversationId: string | undefined, humanMessage: string, branch: ChatTree) => {
    const subscription = router.promptChat.subscribe(
      {
        conversationId,
        branch,
        humanMessageContent: humanMessage,
      },
      {
        onData: (updateEvent) => {
          onUpdate(updateEvent);
        },
        onComplete: () => {
          setCancelCurrentStream(undefined);
          onComplete();
        },
        onError: (err) => {
          console.error('Chat error:', err);
          cancelStream();
        },
      }
    );

    setCancelCurrentStream((cancel) => {
      if (cancel) {
        cancel();
      }

      return () => {
        subscription.unsubscribe();
      };
    });
  };

  return {
    beginStream,
    cancelStream,
    isStreaming: !!cancelCurrentStream,
  };
}

type RouterTypeFromAgent<Agent extends ChatAgent> = ReturnType<
  typeof createTRPCProxyClient<ReturnType<typeof makeChatRouterForAgent<Agent, any>>>
>;

type ActiveCallbackWithResponse<ToolName extends string, CallbackName extends string, ToolArgs, ResponseType> = Omit<
  ActiveCallback<ToolName, CallbackName, ToolArgs>,
  'remove'
> & {
  respond: (response: ResponseType) => void;
};

function mapActiveCallbackAddResponse<ToolName extends string, CallbackName extends string, ToolArgs, ResponseType>(
  callback: ActiveCallback<ToolName, CallbackName, ToolArgs>,
  respond: (response: ResponseType) => Promise<void>
): ActiveCallbackWithResponse<ToolName, CallbackName, ToolArgs, ResponseType> {
  return {
    ...callback,
    respond,
  };
}

export type AnyActiveCallbackWithResponse = ActiveCallbackWithResponse<string, string, any, any>;

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

export type AdvancedToolCallClientSideWithCallbacks<Tool extends AnyStructuredChatTool> = {
  id: string;

  name: Tool['TypeInfo']['Name'];

  // May or may not be present. The name is known first, then the preview args get sent along after
  args?: Tool['TypeInfo']['ArgsForClient'];
  // May or may not be present. May be sent along when the tool is being executed. Does not persist.
  progressStatus?: Tool['TypeInfo']['ToolProgress'];
  // May or may not be present. Generally present when the tool finishes executing.
  result?: Tool['TypeInfo']['ResultForClient'];
  state: ToolCallState;

  // callbacks: CallbacksFromToolCallbacks<Tool>[];
  callbacks: CallbacksFromToolCallbacks<Tool>[];
};

export type AdvancedToolCallClientSideWithCallbacksFromToolsArray<Tools extends readonly AnyStructuredChatTool[]> = {
  [K in keyof Tools]: AdvancedToolCallClientSideWithCallbacks<Tools[K]>;
}[number];

export type AdvancedAIMessageDataPartClientSideWithCallbacks<Tools extends readonly AnyStructuredChatTool[]> = {
  content: MessageContent;
  toolCalls: AdvancedToolCallClientSideWithCallbacksFromToolsArray<Tools>[];
};

export type AdvancedAIMessageDataClientSideWithCallbacks<Tools extends readonly AnyStructuredChatTool[]> = {
  kind: 'ai';
  id: string;
  parts: AdvancedAIMessageDataPartClientSideWithCallbacks<Tools>[];
};
