import type { AnyStructuredChatTool, ChatAgent } from '@trpc-chat-agent/core';
import type { z } from 'zod';

export type CreateChatAgentArgs<Tools extends readonly AnyStructuredChatTool[]> = {
  // Common
  tools: Tools;
  debounceMs?: number;
};

export function createChatAgentLangchain<const Tools extends readonly AnyStructuredChatTool[]>(
  _args: CreateChatAgentArgs<Tools>
): ChatAgent<Tools, z.ZodObject<{}>> {
  throw new Error('Not implemented');
}
