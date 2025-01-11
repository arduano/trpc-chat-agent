import type { ChatAIMessageToolCall, ToolCallState } from '@trpc-chat-agent/core';
import { cn } from '@/lib/utils';

interface ToolCallWrapperProps {
  children?: React.ReactNode;
  tool: ChatAIMessageToolCall<any>;
  title?: string;
}

export function ToolCallWrapper({ children, tool, title }: ToolCallWrapperProps) {
  return (
    <div className="pl-4 border-l-2 border-muted">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-2 h-2 rounded-full', getStatusColor(tool.state))} />
        <span className="text-sm font-medium">{title}</span>
      </div>
      {children}
    </div>
  );
}

const getStatusColor = (state: ToolCallState) => {
  switch (state) {
    case 'loading':
      return 'bg-blue-600';
    case 'complete':
      return 'bg-green-600';
    case 'aborted':
      return 'bg-red-600';
    default:
      return 'bg-background-600';
  }
};
