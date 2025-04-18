import { cn } from '@site/src/lib/utils';
import { type ChatUserMessage, userContentToText } from '@trpc-chat-agent/core';
import { useState } from 'react';
import { RiPencilFill } from 'react-icons/ri';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { MessageVariants } from './MessageVariants';
import { StyledMarkdown } from './StyledMarkdown';

export function UserMessage({ message }: { message: ChatUserMessage }) {
  const [isEditing, setIsEditing] = useState(false);
  const textContent = userContentToText(message.parts);
  const [editedContent, setEditedContent] = useState(textContent);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    message.edit({ content: editedContent });
    setIsEditing(false);
  };

  return (
    <div className={cn('group flex items-start gap-2', !isEditing && 'pl-12 lg:pl-48')}>
      {!isEditing && (
        <Button
          onClick={() => {
            setIsEditing(!isEditing);
            setEditedContent(textContent);
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
                    setEditedContent(textContent);
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
          <Card className="p-4 bg-secondary motion-ease-in motion-preset-slide-up-md motion-duration-100">
            <StyledMarkdown>{textContent}</StyledMarkdown>
          </Card>
        )}
      </div>
    </div>
  );
}
