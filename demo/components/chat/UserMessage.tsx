import type { ReadonlySignal } from '@preact/signals-core';
import type { AgentExtraArgs, AnyChatAgent, ChatUserMessage } from '@trpc-chat-agent/core';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { RiPencilFill } from 'react-icons/ri';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { MessageVariants } from './MessageVariants';
import { StyledMarkdown } from './StyledMarkdown';

export function UserMessage<Agent extends AnyChatAgent>({
  message,
  invokeArgs: extraArgs,
}: {
  message: ChatUserMessage<Agent>;
  invokeArgs: ReadonlySignal<AgentExtraArgs<Agent>>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content as string);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    message.edit({ content: editedContent, invokeArgs: extraArgs.peek() });
    setIsEditing(false);
  };

  return (
    <div className={cn('group flex items-start gap-2', !isEditing && 'pl-12 lg:pl-48')}>
      {!isEditing && (
        <Button
          onClick={() => {
            setIsEditing(!isEditing);
            setEditedContent(message.content as string);
          }}
          variant="ghost"
          size="sm"
          className={cn(
            'mt-2 p-2 text-muted-foreground rounded-full hover:text-foreground opacity-0 group-hover:opacity-100',
            message.path.count > 1 && 'mt-7'
          )}
        >
          <RiPencilFill size={14} />
        </Button>
      )}
      <div className="flex-1">
        {message.path.count > 1 && !isEditing && <MessageVariants path={message.path} />}
        {isEditing ? (
          <form onSubmit={handleSubmit}>
            <Card className="p-4">
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="resize-none min-h-0 border-0 p-0 focus-visible:ring-0 bg-transparent"
                autoFocus
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
                style={{
                  height: 'auto',
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight + 2}px`;
                }}
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedContent(message.content as string);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save changes
                </Button>
              </div>
            </Card>
          </form>
        ) : (
          <Card className="p-4 bg-secondary markdown">
            <StyledMarkdown>{message.content as string}</StyledMarkdown>
          </Card>
        )}
      </div>
    </div>
  );
}
