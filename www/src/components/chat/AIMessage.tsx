import type { ChatAIMessage } from '@trpc-chat-agent/core';
import type { JSX } from 'react';
import { cn } from '@site/src/lib/utils';
import { CgRedo } from 'react-icons/cg';
import { Button } from '../ui/button';
import { MessageVariants } from './MessageVariants';

export function AIMessageShell({ message, children }: { message: ChatAIMessage<any>; children: React.ReactNode }) {
  return (
    <div className="group flex items-start max-w-full gap-2 pr-12 lg:pr-48">
      <div className="flex-1 max-w-full">
        {message.path.count > 1 && <MessageVariants path={message.path} />}
        <div className="space-y-4">{children}</div>
      </div>
      <Button
        onClick={() => message.regenerate()}
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
