'use client';

import type { AgentType } from '@/server/agent';
import type { AgentExtraArgs } from '@trpc-chat-agent/core';
import type { UseConversationArgs } from '@trpc-chat-agent/react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { trpcClient } from '@/utils/trpc';

import { useSignal } from '@preact/signals-react';
import { RenderMessages, useConversation } from '@trpc-chat-agent/react';
import React, { useEffect, useRef, useState } from 'react';
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const { messages, beginMessage, isStreaming, isLoadingConversation, isMissingConversation } =
    useConversation<AgentType>({
      initialConversationId: id,
      onUpdateConversationId: converationArgs.onUpdateConversationId,
      router: trpcClient.chat,
    });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const invokeArgs = useSignal<AgentExtraArgs<AgentType>>({});

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    beginMessage({ userMessage: input, invokeArgs: invokeArgs.peek() });
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <ScrollArea className="flex-1 h-full">
        <Card className=" border-0 rounded-none shadow-none relative">
          <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
            {isMissingConversation ? (
              <div className="text-center p-4 text-destructive">This conversation could not be found.</div>
            ) : (
              <RenderMessages
                messages={messages}
                renderAiMessageShell={(message, children) => (
                  <AIMessageShell message={message} children={children} invokeArgs={invokeArgs} />
                )}
                renderAiMessagePartContent={(content) => <StyledMarkdown>{content as string}</StyledMarkdown>}
                renderUserMessage={(message) => <UserMessage message={message} invokeArgs={invokeArgs} />}
                renderToolCall={(tool) => <RenderTool tool={tool} />}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        </Card>
      </ScrollArea>

      <Card className="border-t rounded-none p-4">
        <form onSubmit={handleSubmit} className="flex gap-4 max-w-4xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
