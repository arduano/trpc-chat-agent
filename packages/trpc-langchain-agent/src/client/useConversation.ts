import type { createTRPCProxyClient } from '@trpc/client';
import type { AdvancedReactAgent } from '../common/advancedReactAgent';
import type { ChatTree, ClientSideUpdate } from '../common/types';
import type { makeChatRouterForAgent } from '../server';
import { useEffect, useMemo, useState } from 'react';
import { ClientSideChatConversation } from '../common/types';
import { useConversationStore } from './clientConversationStore';

type UseConversationArgs<Agent extends AdvancedReactAgent> = {
  conversationId?: string;
  router: RouterTypeFromAgent<Agent>;
  onUpdateConversationId?: (conversationId: string) => void;
};

export function useConversation<Agent extends AdvancedReactAgent>({
  conversationId,
  router,
  onUpdateConversationId,
}: UseConversationArgs<Agent>) {
  // Use the mutation functions in the store
  const store = useConversationStore((data) => data.mutate);
  const conversationFromStore = useConversationStore((data) =>
    conversationId === undefined ? undefined : data.get.conversation(conversationId)
  );

  const [branch, setBranch] = useState<ChatTree>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(conversationId);

  const [isConversationMissing, setIsConversationMissing] = useState(false);

  const [placeholderConversation, setPlaceholderConversation] = useState<ClientSideChatConversation<Agent>>(() =>
    ClientSideChatConversation.makePlaceholderConversation<Agent>()
  );

  const { beginStream, cancelStream, isStreaming } = useConversationStreamer(router, (update) => {
    store.processClientEvent(update);

    if (update.kind === 'sync-conversation') {
      setBranch(update.branch);
    }

    // Ensure the conversation ID is in sync. For example, when
    // the ID was undefined, but a new conversation was created
    if (currentConversationId !== update.conversationId) {
      onUpdateConversationId?.(update.conversationId);
      setCurrentConversationId(update.conversationId);
    }
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
  const isLoadingConversation =
    !isConversationMissing && conversationId && !store.isConversationPresent(conversationId);

  // Can start a new message when the conversation isn't guaranteed to be missing,
  // And when it's not loading
  const canStartNewMessage = !isConversationMissing && !isLoadingConversation;

  // Use the current conversation
  const conversation = (conversationFromStore ?? placeholderConversation) as ClientSideChatConversation<Agent>;

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

  return {
    beginMessage,
    messages,
    isStreaming,
    cancelStream,
    isLoadingConversation,
    isConversationMissing,
  };
}

function useConversationStreamer<Agent extends AdvancedReactAgent>(
  router: RouterTypeFromAgent<Agent>,
  onUpdate: (event: ClientSideUpdate) => void
) {
  const [cancelCurrentStream, setCancelCurrentStream] = useState<(() => void) | undefined>(undefined);

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

type RouterTypeFromAgent<Agent extends AdvancedReactAgent> = ReturnType<
  typeof createTRPCProxyClient<ReturnType<typeof makeChatRouterForAgent<Agent, any>>>
>;
