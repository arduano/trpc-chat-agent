import type { ChatAgent, makeChatRouterForAgent } from '@arduano/trpc-chat-agent';
import type { ReadonlySignal } from '@preact/signals-core';
import type { createTRPCProxyClient } from '@trpc/client';
import { createSystemStateStore, createSystemStateStoreSubscriber } from '@arduano/trpc-chat-agent';
import { useEffect, useMemo, useState } from 'react';

type UseConversationArgs<Agent extends ChatAgent> = {
  conversationId?: string;
  router: RouterTypeFromAgent<Agent>;
  onUpdateConversationId?: (conversationId: string) => void;
};

type RouterTypeFromAgent<Agent extends ChatAgent> = ReturnType<
  typeof createTRPCProxyClient<ReturnType<typeof makeChatRouterForAgent<Agent, any>>>
>;

const store = createSystemStateStore();

export function useConversation<Agent extends ChatAgent>(args: UseConversationArgs<Agent>) {
  const subscriber = useMemo(() => {
    return createSystemStateStoreSubscriber({
      store,
      initialConversationId: args.conversationId,
      router: args.router,
      onUpdateConversationId: args.onUpdateConversationId,
    });
  }, []);

  return {
    beginMessage: subscriber.beginMessage,
    cancelStream: subscriber.cancelStream,

    // Propagate signals as react hooks, automatically re-rendering when they change
    conversation: useSignalValue(subscriber.conversation),
    messages: useSignalValue(subscriber.messages),
    isStreaming: useSignalValue(subscriber.isStreaming),
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
