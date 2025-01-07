import type { ReadonlySignal } from '@preact/signals-core';
import type { ChatAgentOrTools, RouterTypeFromAgent } from '@trpc-chat-agent/core';
import { createSystemStateStore, createSystemStateStoreSubscriber } from '@trpc-chat-agent/core';
import { useEffect, useMemo, useState } from 'react';

export type UseConversationArgs<Agent extends ChatAgentOrTools> = {
  initialConversationId?: string;
  router: RouterTypeFromAgent<Agent>;
  onUpdateConversationId?: (conversationId: string) => void;
};

const store = createSystemStateStore();

export function useConversation<Agent extends ChatAgentOrTools>(args: UseConversationArgs<Agent>) {
  const subscriber = useMemo(() => {
    return createSystemStateStoreSubscriber({
      store,
      initialConversationId: args.initialConversationId,
      router: args.router,
      onUpdateConversationId: args.onUpdateConversationId,
    });
  }, []);

  // Force cancel stream when the component unmounts
  useEffect(() => {
    return () => {
      subscriber.cancelStream();
    };
  }, []);

  return {
    beginMessage: subscriber.beginMessage,
    cancelStream: subscriber.cancelStream,

    // Propagate signals as react hooks, automatically re-rendering when they change
    conversation: useSignalValue(subscriber.conversation),
    messages: useSignalValue(subscriber.messages),
    isStreaming: useSignalValue(subscriber.isStreaming),
    conversationError: useSignalValue(subscriber.conversationError),
    hasConversation: useSignalValue(subscriber.hasConversation),
    isLoadingConversation: useSignalValue(subscriber.isLoadingConversation),
    isMissingConversation: useSignalValue(subscriber.isMissingConversation),
  };
}

function useSignalValue<T>(signal: ReadonlySignal<T>) {
  const [value, setValue] = useState(signal.value);

  useEffect(() => {
    const unsub = signal.subscribe(() => {
      setValue(signal.value);
    });
    return unsub;
  }, [signal]);

  return value;
}
