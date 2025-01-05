'use client';

import type { AgentType } from '@/server/agent';
import type {
  AnyStructuredChatTool,
  ChatAIMessage,
  ChatAIMessagePart,
  ChatAIMessageToolCall,
  ChatHumanMessage,
  ChatPathStateWithSwitch,
  GetToolByName,
  MessageContent,
} from '@trpc-chat-agent/core';
import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { trpcClient } from '@/utils/trpc';
import { useConversation } from '@trpc-chat-agent/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CgRedo } from 'react-icons/cg';
import { RiPencilFill } from 'react-icons/ri';

import { RenderTool } from './RenderTool';
import { StyledMarkdown } from './StyledMarkdown';

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

function ChatComponentWithStaticId({ id, onUpdateConversationId }: ChatComponentProps) {
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
      <ScrollArea className="flex-1 h-full">
        <Card className=" border-0 rounded-none shadow-none relative">
          <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
            <RenderMessages
              messages={messages}
              renderAiMessageShell={(message, children) => <AIMessageShell message={message} children={children} />}
              renderAiMessagePartContent={(content) => <StyledMarkdown>{content as string}</StyledMarkdown>}
              renderHumanMessage={(message) => <HumanMessage message={message} />}
              renderToolCall={(toolCall) => <RenderTool tool={toolCall} />}
            />
            <div ref={messagesEndRef} />
          </div>
        </Card>
      </ScrollArea>

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

function RenderMemoed<T extends readonly any[]>({ data, render }: { data: T; render: (...args: T) => JSX.Element }) {
  const jsx = useMemo(() => (!render ? 'Error: render function was missing' : render(...data)), data);
  return jsx;
}

function RenderMessages<Tools extends readonly AnyStructuredChatTool[]>({
  messages,
  renderHumanMessage,
  renderAiMessagePartContent,
  renderToolCall,
  renderAiMessageShell,
  renderToolCallShell,
}: {
  messages: (ChatAIMessage<Tools> | ChatHumanMessage)[];
  renderAiMessageShell?: (message: ChatAIMessage<Tools>, children: JSX.Element) => JSX.Element;
  renderAiMessagePartContent: (content: MessageContent) => JSX.Element;
  renderToolCallShell?: (toolCall: ChatAIMessageToolCall<Tools>, children: JSX.Element) => JSX.Element;
  renderToolCall:
    | {
        [K in Tools[number]['TypeInfo']['Name']]: (toolCall: GetToolByName<K, Tools>) => JSX.Element;
      }
    | ((toolCall: ChatAIMessageToolCall<Tools>) => JSX.Element);
  renderHumanMessage: (message: ChatHumanMessage) => JSX.Element;
}) {
  const defaultShellRender = useCallback((data: any, children: JSX.Element) => <>{children}</>, []);

  renderAiMessageShell ??= defaultShellRender;
  renderToolCallShell ??= defaultShellRender;

  const renderSingleToolCall = (toolCall: ChatAIMessageToolCall<Tools>) => {
    const toolCallRenderFn = typeof renderToolCall === 'function' ? renderToolCall : renderToolCall[toolCall.name];

    if (!toolCallRenderFn) {
      return <>{`Tool call with name "${toolCall.name}" not found`}</>;
    }

    return <RenderMemoed key={toolCall.id} data={[toolCall as any]} render={toolCallRenderFn as any} />;
  };

  const renderAllToolCalls = (toolCalls: ChatAIMessageToolCall<Tools>[]) => {
    return (
      <>
        {toolCalls.map((toolCall) => {
          const toolCallRendered = renderSingleToolCall(toolCall);
          return <RenderMemoed key={toolCall.id} data={[toolCall, toolCallRendered]} render={renderToolCallShell} />;
        })}
      </>
    );
  };

  const renderAiMessagePart = (message: ChatAIMessagePart<Tools>) => {
    const content = <RenderMemoed data={[message.content]} render={renderAiMessagePartContent} />;
    const toolCalls = <RenderMemoed data={[message.toolCalls]} render={renderAllToolCalls} />;
    return (
      <>
        {content}
        {toolCalls}
      </>
    );
  };

  const renderAiMessage = (message: ChatAIMessage<Tools>) => {
    const parts = (
      <>
        {message.parts.map((part, i) => (
          <RenderMemoed key={i} data={[part]} render={renderAiMessagePart} />
        ))}
      </>
    );

    return <RenderMemoed data={[message, parts]} render={renderAiMessageShell} />;
  };

  const renderAllMessages = (messages: (ChatAIMessage<Tools> | ChatHumanMessage)[]) => {
    return (
      <>
        {messages.map((message) => {
          if (message.kind === 'human') {
            return <RenderMemoed key={message.id} data={[message]} render={renderHumanMessage} />;
          } else {
            return <RenderMemoed key={message.id} data={[message]} render={renderAiMessage} />;
          }
        })}
      </>
    );
  };

  return <RenderMemoed data={[messages]} render={renderAllMessages} />;
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

function AIMessageShell({ message, children }: { message: ChatAIMessage<AgentType>; children: JSX.Element }) {
  return (
    <div className="group flex items-start gap-2 pr-12 lg:pr-48">
      <div className="flex-1">
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
