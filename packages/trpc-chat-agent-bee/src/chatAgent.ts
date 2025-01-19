import type { AnyStructuredChatTool, ChatAgent } from '@trpc-chat-agent/core';
import type { z } from 'zod';

export type CreateChatAgentArgs<Tools extends readonly AnyStructuredChatTool[]> = {
  // Common
  tools: Tools;
  debounceMs?: number;
};

export function createChatAgentLangchain<const Tools extends readonly AnyStructuredChatTool[]>(
  _args: CreateChatAgentArgs<Tools>
  // eslint-disable-next-line ts/no-empty-object-type
): ChatAgent<Tools, z.ZodObject<{}>> {
  throw new Error('Not implemented');
}
