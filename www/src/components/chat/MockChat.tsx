'use client';

import type { AgentTools, ChatAgent } from '@trpc-chat-agent/core';
import type { RenderMessagesProps, UseConversationArgs } from '@trpc-chat-agent/react';
import { Card } from '@site/src/components/ui/card';
import { RenderMessages, useConversation } from '@trpc-chat-agent/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { AIMessageShell } from './AIMessage';
import { HumanMessage } from './HumanMessage';
import { StyledMarkdown } from './StyledMarkdown';
import { buildMockTrpcChatRouter } from '@site/src/lib/mockChatRouterForAgent';

export type MockChatComponentProps<Agent extends ChatAgent<any>> = Omit<
  UseConversationArgs<Agent>,
  'initialConversationId' | 'router'
> &
  Pick<RenderMessagesProps<AgentTools<Agent>>, 'renderToolCall'> & {
    id?: string;
    agent?: Agent;
    seedPrompt?: string;
  };

export function MockChat<Agent extends ChatAgent<any>>({
  id,
  renderToolCall,
  agent,
  ...converationArgs
}: MockChatComponentProps<Agent>) {
  const mockRouter = useMemo(() => {
    return buildMockTrpcChatRouter(agent);
  }, []);

  const { messages, beginMessage, isLoadingConversation } = useConversation<Agent>({
    initialConversationId: id,
    onUpdateConversationId: converationArgs.onUpdateConversationId,
    router: mockRouter as any,
  });

  useEffect(() => {
    if (!isLoadingConversation) {
      beginMessage(converationArgs.seedPrompt || 'hello');
    }
  }, [isLoadingConversation]);

  return (
    <div className="flex flex-col">
      <Card className=" border-0 rounded-none shadow-none relative">
        <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
          <RenderMessages
            messages={messages}
            renderAiMessageShell={(message, children) => <AIMessageShell message={message} children={children} />}
            renderAiMessagePartContent={(content) => <StyledMarkdown>{content as string}</StyledMarkdown>}
            renderHumanMessage={(message) => <HumanMessage message={message} />}
            renderToolCall={renderToolCall}
          />
        </div>
      </Card>
    </div>
  );
}
