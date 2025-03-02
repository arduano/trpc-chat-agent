import type { MessageContent } from '@trpc-chat-agent/core';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import zodToJsonSchema from 'zod-to-json-schema';
import { StructuredChatToolLangChain } from './tool';

export const AnthropicCacheLevels = {
  Nothing: 'nothing',
  ToolsOnly: 'tools',
  UpToSystemMessage: 'up-to-system-message',
  UpToSecondLastMessage: 'up-to-second-last-message',
  Everything: 'everything',
} as const;

export type AnthropicCacheLevel = (typeof AnthropicCacheLevels)[keyof typeof AnthropicCacheLevels];

const AnthropicCacheLevelValues: Record<AnthropicCacheLevel, number> = {
  [AnthropicCacheLevels.Nothing]: 0,
  [AnthropicCacheLevels.ToolsOnly]: 1,
  [AnthropicCacheLevels.UpToSystemMessage]: 2,
  [AnthropicCacheLevels.UpToSecondLastMessage]: 3,
  [AnthropicCacheLevels.Everything]: 4,
};

function shouldUseAnthropicCacheLevel(givenLevel: AnthropicCacheLevel, expectedLevel: AnthropicCacheLevel): boolean {
  return AnthropicCacheLevelValues[givenLevel] >= AnthropicCacheLevelValues[expectedLevel];
}

function mapToolsForAnthropicCache(tools: StructuredChatToolLangChain<any>[]) {
  const lastToolIndex = tools.length - 1;

  return tools.map((tool, index) => {
    const schema = {
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.schema) as any,
    };

    if (index === lastToolIndex) {
      // Include the cache control directive on the last tool
      return {
        ...schema,
        cache_control: { type: 'ephemeral' },
      };
    } else {
      return schema;
    }
  });
}

function assertAllMessagesAreBaseMessage(messages: unknown[]): messages is BaseMessage[] {
  for (const message of messages) {
    if (!(message instanceof BaseMessage)) {
      return false;
    }
  }

  return true;
}

function assertAllToolsLangchainTool(tools: unknown[]): tools is StructuredChatToolLangChain[] {
  for (const tool of tools) {
    if (!(tool instanceof StructuredChatToolLangChain)) {
      return false;
    }
  }

  return true;
}

function mapMessageContentForAntropicCache(content: MessageContent): MessageContent {
  if (typeof content === 'string') {
    return [
      {
        type: 'text',
        text: content,
        cache_control: { type: 'ephemeral' },
      },
    ];
  }

  const lastPartIndex = content.length - 1;
  return content.map((part, index) => {
    if (index === lastPartIndex) {
      return {
        ...part,
        cache_control: { type: 'ephemeral' },
      };
    } else {
      return part;
    }
  });
}

function mapMessageForAntropicCache(message: BaseMessage) {
  const raw = message.toDict().data;
  const content = raw.content as MessageContent;

  if (message instanceof AIMessage) {
    return new AIMessage({
      ...raw,
      content: mapMessageContentForAntropicCache(content),
    });
  }
  if (message instanceof HumanMessage) {
    return new HumanMessage({
      ...raw,
      content: mapMessageContentForAntropicCache(content),
    });
  }
  if (message instanceof SystemMessage) {
    return new SystemMessage({
      ...raw,
      content: mapMessageContentForAntropicCache(content),
    });
  }
  if (message instanceof ToolMessage) {
    return new ToolMessage({
      ...(raw as any),
      content: mapMessageContentForAntropicCache(content),
    });
  }
  return message;
}

export function mapMessagesForModel(
  messages: BaseMessage[],
  options: { anthropicCacheLevel: AnthropicCacheLevel }
): unknown[] {
  const shouldCacheSystemMessage = shouldUseAnthropicCacheLevel(
    AnthropicCacheLevels.UpToSystemMessage,
    options.anthropicCacheLevel
  );
  const shouldCacheSecondLastMessage = shouldUseAnthropicCacheLevel(
    AnthropicCacheLevels.UpToSecondLastMessage,
    options.anthropicCacheLevel
  );
  const shouldCacheLastMessage = shouldUseAnthropicCacheLevel(
    AnthropicCacheLevels.Everything,
    options.anthropicCacheLevel
  );

  const systemMessageIndex = 0;
  const secondLastMessageIndex = messages.length - 2;
  const lastMessageIndex = messages.length - 1;

  return messages.map((message, index) => {
    if (index === systemMessageIndex && shouldCacheSystemMessage) {
      return mapMessageForAntropicCache(message);
    } else if (index === secondLastMessageIndex && shouldCacheSecondLastMessage) {
      return mapMessageForAntropicCache(message);
    } else if (index === lastMessageIndex && shouldCacheLastMessage) {
      return mapMessageForAntropicCache(message);
    } else {
      return message;
    }
  });
}

export function addAnthropicMessageCache(args: {
  messages: BaseMessage[];
  tools: StructuredChatToolLangChain<any>[];
  anthropicCacheLevel?: AnthropicCacheLevel;
}) {
  const level = args.anthropicCacheLevel ?? AnthropicCacheLevels.Everything;

  let tools: unknown[] = args.tools;
  if (shouldUseAnthropicCacheLevel(AnthropicCacheLevels.ToolsOnly, level)) {
    if (!assertAllToolsLangchainTool(args.tools)) {
      throw new TypeError('tools must be an array of StructuredChatToolLangChain when applying Anthropic cache');
    }
    tools = mapToolsForAnthropicCache(args.tools);
  }

  if (!assertAllMessagesAreBaseMessage(args.messages)) {
    throw new TypeError('messages must be an array of BaseMessage when applying Anthropic cache');
  }

  const messages: unknown[] = mapMessagesForModel(args.messages, {
    anthropicCacheLevel: level,
  });

  return {
    tools,
    messages,
  };
}
