import { HumanMessage } from '@site/src/components/chat/HumanMessage';
import { MockChat } from '@site/src/components/chat/MockChat';
import { ClientSideConversationUpdate, initAgents, MockAgentBackend, ResponseUpdate } from '@trpc-chat-agent/core';
import { createTRPCClient, TRPCLink } from '@trpc/client';
import { AnyRouter, AnyTRPCProcedure, initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { useEffect } from 'react';

const responseMessage = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

function mockTokenize(text: string) {
  const splitBySpace = text.split(' ').map((s) => s + ' ');

  const tokens: string[] = [];

  for (const word of splitBySpace) {
    if (word.length <= 10) {
      tokens.push(word);
      continue;
    }

    // For longer words, split them into chunks of up to 10 characters
    let remainingWord = word;
    while (remainingWord.length > 0) {
      // Randomly choose a split point between 4 and 10 characters
      // or the remaining length, whichever is smaller
      const maxSplitPoint = Math.min(10, remainingWord.length);
      const minSplitPoint = Math.min(4, maxSplitPoint);
      const splitPoint = Math.floor(Math.random() * (maxSplitPoint - minSplitPoint + 1)) + minSplitPoint;

      tokens.push(remainingWord.slice(0, splitPoint));
      remainingWord = remainingWord.slice(splitPoint);
    }
  }

  return tokens;
}

function splitTextToUpdates(args: { text: string; conversationId: string; messageId: string }) {
  const tokens = mockTokenize(args.text);
  return tokens.map<ResponseUpdate>((c) => ({
    update: {
      kind: 'update-content',
      messageId: args.messageId,
      contentToAppend: c,
      conversationId: args.conversationId,
    },
    delay: 10,
  }));
}

const ai = initAgents.backend(new MockAgentBackend()).create();
const agent = ai.agent({
  generateResponseUpdates: ({ conversationId, messageId }) => {
    const updates = splitTextToUpdates({ text: responseMessage, conversationId, messageId });
    return [{ delay: 10, update: { kind: 'begin-new-ai-message-part', messageId } }, ...updates];
  },
  tools: [],
});

export function HumanMessageComponent() {
  return <MockChat agent={agent} renderToolCall={{}} />;
}
