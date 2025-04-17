import type { ReadonlySignal } from '@preact/signals-core';
import type { AnyChatAgent, ExtraArgsFields, RouterTypeFromAgent } from '@trpc-chat-agent/core';
import { computed } from '@preact/signals-core';
import { createSystemStateStore, createSystemStateStoreSubscriber } from '@trpc-chat-agent/core';
import { useEffect, useMemo, useState } from 'react';

export type UseConversationArgs<Agent extends AnyChatAgent> = {
  initialConversationId?: string;
  router: RouterTypeFromAgent<Agent>;
  onUpdateConversationId?: (conversationId: string) => void;
  useIndexdbCache?: boolean;
} & ExtraArgsFields<'extraArgs', Agent>;

const store = createSystemStateStore();

export function useConversation<Agent extends AnyChatAgent>(args: UseConversationArgs<Agent>) {
  const subscriber = useMemo(() => {
    return createSystemStateStoreSubscriber({
      store,
      initialConversationId: args.initialConversationId,
      router: args.router,
      onUpdateConversationId: args.onUpdateConversationId,
      useIndexdbCache: args.useIndexdbCache,
      initialExtraArgs: args.extraArgs,
    });
  }, []);

  // Force cancel stream when the component unmounts
  useEffect(() => {
    return () => {
      subscriber.cancelStream();
    };
  }, []);

  useEffect(() => {
    subscriber.extraArgs.value = args.extraArgs;
  }, [args.extraArgs]);

  const lastAiMessage = computed(() => subscriber.conversation.value.getAIMessageAt(subscriber.conversationPath.value));

  return {
    beginMessage: subscriber.beginMessage,
    cancelStream: subscriber.cancelStream,

    // Propagate signals as react hooks, automatically re-rendering when they change
    conversation: useSignalValue(subscriber.conversation),
    messages: useSignalValue(subscriber.messages),
    isStreaming: useSignalValue(subscriber.isStreaming),
    conversationError: useSignalValue(subscriber.conversationError),
    conversationId: useSignalValue(subscriber.conversationId),
    isLoadingConversation: useSignalValue(subscriber.isLoadingConversation),
    isMissingConversation: useSignalValue(subscriber.isMissingConversation),
    conversationPath: useSignalValue(subscriber.conversationPath),
    lastAiMessage: useSignalValue(lastAiMessage),
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
