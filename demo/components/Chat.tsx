'use client';

import type { AgentType } from '@/server/agent';
import type {
  AIMessageWithCallbacks,
  AnyStructuredChatTool,
  ChatHumanMessage,
  ChatPathStateWithSwitch,
} from '@arduano/trpc-chat-agent';
import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { trpcClient } from '@/utils/trpc';
import { useConversation } from '@arduano/trpc-chat-agent-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaPencilAlt, FaRedo } from 'react-icons/fa';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RenderTool } from './RenderTool';

export type ChatComponentProps = {
  id?: string;
  onUpdateConversationId?: (id: string) => void;
};

export function Chat({ id, onUpdateConversationId }: ChatComponentProps) {
  const [key, setKey] = useState(0);
  const [pastId, setPastId] = useState(id);

  // Force re-mount the chat component when the id changes.
  useEffect(() => {
    if (id !== pastId) {
      setPastId(id);
      if (pastId !== undefined) {
        setKey((k) => k + 1);
      }
    }
  }, [id]);

  return <ChatComponentWithStaticId key={key} id={id} onUpdateConversationId={onUpdateConversationId} />;
}

export function ChatComponentWithStaticId({ id, onUpdateConversationId }: ChatComponentProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const { messages, beginMessage, isStreaming } = useConversation({
    router: trpcClient.chat,
    initialConversationId: id,
    onUpdateConversationId: (newId) => {
      if (onUpdateConversationId) {
        onUpdateConversationId(newId);
      }
    },
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    beginMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <Card className="flex-1 border-0 rounded-none shadow-none relative">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
            <RenderMessages
              messages={messages}
              renderAiMessage={(message) => <AIMessage message={message} />}
              renderHumanMessage={(message) => <HumanMessage message={message} />}
            />
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </Card>

      <Card className="border-t rounded-none p-4">
        <form onSubmit={handleSubmit} className="flex gap-4 max-w-4xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
            placeholder="Type a message..."
            className="resize-none rounded-xl min-h-[44px] max-h-[200px] overflow-y-auto scrollbar scrollbar-thumb-secondary scrollbar-track-transparent"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isStreaming && input.trim()) {
                  handleSubmit(e as any);
                }
              }
            }}
            style={{
              height: 'auto',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
        </form>
      </Card>
    </div>
  );
}

function RenderMemoed<T>({ data, render }: { data: T; render: (data: T) => JSX.Element }) {
  const jsx = useMemo(() => render(data), [data]);
  return <>{jsx}</>;
}

function RenderMessages<Tools extends readonly AnyStructuredChatTool[]>({
  messages,
  renderAiMessage,
  renderHumanMessage,
}: {
  messages: (AIMessageWithCallbacks<Tools> | ChatHumanMessage)[];
  renderAiMessage: (message: AIMessageWithCallbacks<Tools>) => JSX.Element;
  renderHumanMessage: (message: ChatHumanMessage) => JSX.Element;
}) {
  return (
    <>
      {messages.map((message) => {
        if (message.kind === 'human') {
          return <RenderMemoed key={message.id} data={message} render={renderHumanMessage} />;
        } else {
          return <RenderMemoed key={message.id} data={message} render={renderAiMessage} />;
        }
      })}
    </>
  );
}

function MessageVariants({ path }: { path: ChatPathStateWithSwitch }) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
      {Array.from({ length: path.count }, (_, i) => (
        <Button
          key={i}
          onClick={() => path.switchTo(i)}
          variant={path.index === i ? 'secondary' : 'ghost'}
          size="sm"
          className="w-5 h-5 p-0"
        >
          {i + 1}
        </Button>
      ))}
    </div>
  );
}

function HumanMessage({ message }: { message: ChatHumanMessage }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content as string);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    message.edit(editedContent);
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
          <FaPencilAlt size={14} />
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
            <Markdown remarkPlugins={[remarkGfm]}>{message.content as string}</Markdown>
          </Card>
        )}
      </div>
    </div>
  );
}

function AIMessage({ message }: { message: AIMessageWithCallbacks<AgentType> }) {
  return (
    <div className="group flex items-start gap-2 pr-12 lg:pr-48">
      <div className="flex-1">
        {message.path.count > 1 && <MessageVariants path={message.path} />}
        <div className="space-y-4">
          {message.parts.map((part, i) => (
            <React.Fragment key={i}>
              {part.content && (
                <div className="markdown">
                  <Markdown remarkPlugins={[remarkGfm]}>{part.content as string}</Markdown>
                </div>
              )}
              {part.toolCalls.map((toolCall) => (
                <RenderTool key={toolCall.id} tool={toolCall} />
              ))}
            </React.Fragment>
          ))}
        </div>
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
        <FaRedo size={14} />
      </Button>
    </div>
  );
}
