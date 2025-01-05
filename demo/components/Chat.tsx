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
import { FaPencilAlt, FaRedo, FaTimes } from 'react-icons/fa';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RenderTool } from './RenderTool';

export function ChatComponent() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const { messages, beginMessage, isStreaming } = useConversation({
    router: trpcClient.chat,
    initialConversationId: 'xXyAuVcfRRxiymCsskaYd',
    onUpdateConversationId: (newId) => {
      // Handle conversation ID updates if needed
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
            className="resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !isStreaming) {
                  beginMessage(input);
                  setInput('');
                }
              }
            }}
          />
          <Button type="submit" size="lg" disabled={isStreaming || !input.trim()}>
            Send
          </Button>
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
    <div className="flex items-start gap-2 pl-12 lg:pl-48">
      <Button
        onClick={() => setIsEditing(!isEditing)}
        variant="ghost"
        size="sm"
        className={cn(
          'mt-2 p-2 text-muted-foreground rounded-full hover:text-foreground',
          message.path.count > 1 && 'mt-7'
        )}
      >
        {isEditing ? <FaTimes size={14} /> : <FaPencilAlt size={14} />}
      </Button>
      <div className="flex-1">
        {message.path.count > 1 && <MessageVariants path={message.path} />}
        {isEditing ? (
          <form onSubmit={handleSubmit} className="flex-1">
            <div className="flex gap-2">
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="flex-1"
                autoFocus
                rows={Math.max(1, editedContent.split('\n').length)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
              />
              <Button type="submit" size="sm">
                Send
              </Button>
            </div>
          </form>
        ) : (
          <Card className="p-4 bg-secondary">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content as string}</Markdown>
          </Card>
        )}
      </div>
    </div>
  );
}

function AIMessage({ message }: { message: AIMessageWithCallbacks<AgentType> }) {
  return (
    <div className="flex items-start gap-2 pr-12 lg:pr-48">
      <div className="flex-1">
        {message.path.count > 1 && <MessageVariants path={message.path} />}
        <div className="space-y-4">
          {message.parts.map((part, i) => (
            <React.Fragment key={i}>
              {part.content && (
                <Card className="p-4">
                  <Markdown remarkPlugins={[remarkGfm]}>{part.content as string}</Markdown>
                </Card>
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
          'mt-2 p-2 text-muted-foreground rounded-full hover:text-foreground',
          message.path.count > 1 && 'mt-7'
        )}
      >
        <FaRedo size={14} />
      </Button>
    </div>
  );
}
