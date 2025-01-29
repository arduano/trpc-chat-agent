'use client';

import type { AgentTools, AnyChatAgent, ExtraArgsFields } from '@trpc-chat-agent/core';
import type { RenderMessagesProps, UseConversationArgs } from '@trpc-chat-agent/react';
import { Card } from '@site/src/components/ui/card';
import { buildMockTrpcChatRouter } from '@site/src/lib/mockChatRouterForAgent';
import { RenderMessages, useConversation } from '@trpc-chat-agent/react';

import React, { useEffect, useMemo } from 'react';
import { AIMessageShell } from './AIMessage';
import { StyledMarkdown } from './StyledMarkdown';
import { UserMessage } from './UserMessage';

export type MockChatComponentProps<Agent extends AnyChatAgent> = Omit<
  UseConversationArgs<Agent>,
  'initialConversationId' | 'router'
> &
  Pick<RenderMessagesProps<AgentTools<Agent>>, 'renderToolCall'> & {
    id?: string;
    agent?: Agent;
    seedPrompt?: string;
    shouldBegin: boolean;
  } & ExtraArgsFields<'extraArgs', Agent>;

export function MockChat<Agent extends AnyChatAgent>({
  id,
  renderToolCall,
  agent,
  shouldBegin,
  extraArgs,
  ...converationArgs
}: MockChatComponentProps<Agent>) {
  const mockRouter = useMemo(() => {
    return buildMockTrpcChatRouter(agent);
  }, []);

  const { messages, beginMessage, isLoadingConversation } = useConversation<Agent>({
    initialConversationId: id,
    onUpdateConversationId: converationArgs.onUpdateConversationId,
    router: mockRouter as any,
    useIndexdbCache: false,
    extraArgs,
  });

  useEffect(() => {
    if (!isLoadingConversation && shouldBegin) {
      beginMessage({ userMessage: converationArgs.seedPrompt || 'hello' });
    }
  }, [isLoadingConversation, shouldBegin]);

  return (
    <div className="flex flex-col w-full min-w-[320px] max-w-full">
      <Card className="border-0 rounded-none w-full max-w-4xl mx-auto shadow-none relative">
        <div className="flex flex-col gap-4 p-4 w-full mx-auto">
          <RenderMessages
            messages={messages}
            renderAiMessageShell={(message, children) => <AIMessageShell message={message} children={children} />}
            renderAiMessagePartContent={(content) => <StyledMarkdown>{content as string}</StyledMarkdown>}
            renderUserMessage={(message) => <UserMessage message={message} />}
            renderToolCall={renderToolCall}
          />
        </div>
      </Card>
    </div>
  );
}
