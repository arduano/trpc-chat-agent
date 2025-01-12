import type { ReadonlySignal } from '@preact/signals-core';
import type { AgentExtraArgs, AnyChatAgent, ChatAIMessage } from '@trpc-chat-agent/core';
import { cn } from '@/lib/utils';
import { CgRedo } from 'react-icons/cg';
import { Button } from '../ui/button';
import { MessageVariants } from './MessageVariants';

export function AIMessageShell<Agent extends AnyChatAgent>({
  message,
  children,
  invokeArgs,
}: {
  message: ChatAIMessage<Agent>;
  children: JSX.Element;
  invokeArgs: ReadonlySignal<AgentExtraArgs<Agent>>;
}) {
  return (
    <div className="group flex items-start max-w-full gap-2 pr-12 lg:pr-48">
      <div className="flex-1 max-w-full">
        {message.path.count > 1 && <MessageVariants path={message.path} />}
        <div className="space-y-4">{children}</div>
      </div>
      <Button
        onClick={() => message.regenerate({ invokeArgs: invokeArgs.peek() })}
        variant="ghost"
        size="sm"
        className={cn(
          'mt-2 p-2 text-muted-foreground rounded-full hover:text-foreground opacity-0 group-hover:opacity-100',
          message.path.count > 1 && 'mt-7'
        )}
      >
        <CgRedo size={14} />
      </Button>
    </div>
  );
}
