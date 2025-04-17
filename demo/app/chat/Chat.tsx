'use client';

import type { AgentType } from '@/server/agent';
import type { UseConversationArgs } from '@trpc-chat-agent/react';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { trpcClient } from '@/utils/trpc';

import { RenderMessages, useConversation } from '@trpc-chat-agent/react';
import React, { useEffect, useRef, useState } from 'react';
import { FaStop } from 'react-icons/fa';
import { AIMessageShell } from '../../components/chat/AIMessage';
import { StyledMarkdown } from '../../components/chat/StyledMarkdown';
import { UserMessage } from '../../components/chat/UserMessage';
import { RenderTool } from './RenderTool';

export type ChatComponentProps = Omit<UseConversationArgs<AgentType>, 'initialConversationId' | 'router'> & {
  id?: string;
};

export function Chat({ id, ...props }: ChatComponentProps) {
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

  return <ChatComponentWithStaticId key={key} id={id} {...props} />;
}

function ChatComponentWithStaticId({ id, ...converationArgs }: ChatComponentProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = (animated: boolean) => {
    messagesEndRef.current?.scrollIntoView({ behavior: animated ? 'smooth' : 'auto' });
  };

  const {
    messages,
    beginMessage,
    cancelStream,
    isStreaming,
    isLoadingConversation,
    isMissingConversation,
    conversationError,
  } = useConversation<AgentType>({
    initialConversationId: id,
    onUpdateConversationId: converationArgs.onUpdateConversationId,
    router: trpcClient.chat,
  });

  useEffect(() => {
    if (isStreaming) {
      setTimeout(() => {
        scrollToBottom(true);
      }, 0);
    }
  }, [isStreaming]);

  useEffect(() => {
    setTimeout(() => {
      scrollToBottom(true);
    }, 0);
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    beginMessage({ userMessage: input });
    setInput('');
  };

  const adjustTextareaHeight = () => {
    const element = textareaRef.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight + 2}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const conversationErrorString = conversationError && (conversationError as any).message;

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <ScrollArea className="flex-1 h-full">
        <Card className=" border-0 rounded-none shadow-none relative">
          <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
            {isMissingConversation ? (
              <div className="text-center p-4 text-destructive">This conversation could not be found.</div>
            ) : conversationErrorString ? (
              <div className="text-center p-4 text-destructive">Error: {conversationErrorString}</div>
            ) : (
              <div className="flex flex-col gap-2 pb-4">
                <RenderMessages
                  messages={messages}
                  isStreaming={isStreaming}
                  renderAiMessageShell={(message, children, { isLastMessage }) => (
                    <AIMessageShell message={message} children={children} isLastMessage={isLastMessage} />
                  )}
                  renderAiMessageContent={(content) => <StyledMarkdown>{content.text}</StyledMarkdown>}
                  renderAiSpecialContent={(content) => (
                    <blockquote className="border-l-4 border-accent pl-4 my-4 text-accent-foreground">
                      <StyledMarkdown>{content.text}</StyledMarkdown>
                    </blockquote>
                  )}
                  renderUserMessage={(message) => <UserMessage message={message} />}
                  renderToolCall={(tool) => <RenderTool tool={tool} />}
                  renderThinkingIndicator={() => <ThinkingIndicator />}
                />
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </Card>
      </ScrollArea>

      <Card className="border-t rounded-none p-4">
        <form onSubmit={handleSubmit} className="flex gap-4 max-w-4xl mx-auto">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextareaHeight();
              }}
              disabled={isStreaming || isLoadingConversation || isMissingConversation}
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
                adjustTextareaHeight();
              }}
              style={{
                height: 'auto',
              }}
              onInput={adjustTextareaHeight}
            />
            {isStreaming && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => cancelStream()}
              >
                <FaStop size={20} />
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
