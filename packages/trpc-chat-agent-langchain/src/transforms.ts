import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { MessageContent } from '@langchain/core/messages';
import type { ModelInvokeArgs } from './chatAgent';
import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
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

export function shouldUseAnthropicCacheLevel(
  givenLevel: AnthropicCacheLevel,
  expectedLevel: AnthropicCacheLevel
): boolean {
  return AnthropicCacheLevelValues[givenLevel] >= AnthropicCacheLevelValues[expectedLevel];
}

export function mapToolsForAnthropicCache(tools: StructuredChatToolLangChain<any>[]) {
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

export function bindToolsToModel(
  tools: StructuredChatToolLangChain<any>[],
  llm: BaseChatModel,
  options: {
    anthropicCacheLevel: AnthropicCacheLevel;
  }
) {
  if (llm instanceof ChatAnthropic) {
    const shouldUseCache = shouldUseAnthropicCacheLevel(AnthropicCacheLevels.ToolsOnly, options.anthropicCacheLevel);
    if (!shouldUseCache) {
      return llm.bindTools(tools);
    }

    return llm.bindTools(mapToolsForAnthropicCache(tools));
  } else {
    if (!('bindTools' in llm) || typeof llm.bindTools !== 'function') {
      throw new Error(`llm ${llm} must define bindTools method.`);
    }
    return llm.bindTools(tools);
  }
}

export function assertAllMessagesAreBaseMessage(messages: unknown[]): messages is BaseMessage[] {
  for (const message of messages) {
    if (!(message instanceof BaseMessage)) {
      return false;
    }
  }

  return true;
}

export function assertAllToolsLangchainTool(tools: unknown[]): tools is StructuredChatToolLangChain[] {
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
  llm: BaseChatModel,
  options: { anthropicCacheLevel: AnthropicCacheLevel }
): unknown[] {
  if (llm instanceof ChatAnthropic) {
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
  } else {
    return messages;
  }
}

/**
 * Transforms model invocation arguments to be compatible with Anthropic's caching system.
 * This function modifies the messages and tools to ensure they work properly with Anthropic's
 * caching mechanism based on the specified cache level.
 *
 * @param args - The original model invocation arguments
 * @param options - Optional configuration for the transformation
 * @param options.anthropicCacheLevel - Determines what elements should be cached (defaults to Everything)
 * @param options.evenWhenNotAnthropic - If true, applies transformations even when not using Anthropic model
 *
 * @throws {TypeError} When tools are not all StructuredChatToolLangChain instances (if caching tools)
 * @throws {TypeError} When messages are not all BaseMessage instances (if caching messages)
 *
 * @returns The transformed arguments with cached messages and tools.
 *
 * # Note
 *
 * This function transforms the tools to no longer be an array of StructuredChatToolLangChain instances.
 */
function addAnthropicMessageCache(
  args: ModelInvokeArgs,
  options?: { anthropicCacheLevel?: AnthropicCacheLevel; evenWhenNotAnthropic?: boolean }
) {
  if (!(args.llm instanceof ChatAnthropic) && !options?.evenWhenNotAnthropic) {
    return args;
  }

  const level = options?.anthropicCacheLevel ?? AnthropicCacheLevels.Everything;

  let tools = args.tools;
  if (shouldUseAnthropicCacheLevel(AnthropicCacheLevels.ToolsOnly, level)) {
    if (!assertAllToolsLangchainTool(args.tools)) {
      throw new TypeError('tools must be an array of StructuredChatToolLangChain when applying Anthropic cache');
    }
    tools = mapToolsForAnthropicCache(args.tools);
  }

  if (!assertAllMessagesAreBaseMessage(args.messages)) {
    throw new TypeError('messages must be an array of BaseMessage when applying Anthropic cache');
  }

  const messages = mapMessagesForModel(args.messages, args.llm, {
    anthropicCacheLevel: level,
  });

  return {
    ...args,
    tools,
    messages,
  };
}

const blacklistedOSeriesModelsForDeveloperMessage = ['o1-mini'];

function transformSystemToDeveloperMessage(args: ModelInvokeArgs, options?: { onlyForValidModels?: boolean }) {
  // Hacky way of detecting o-series models. Technically would break for o1-mini and some others
  const isValidModel =
    args.llm instanceof ChatOpenAI &&
    args.llm.model.startsWith('o') &&
    !blacklistedOSeriesModelsForDeveloperMessage.includes(args.llm.model);

  if (options?.onlyForValidModels && !isValidModel) {
    return args;
  }

  // First message has to be a base system message
  const firstMessage = args.messages[0];
  if (!(firstMessage instanceof SystemMessage)) {
    return args;
  }

  args.messages[0] = {
    role: 'developer',
    content: firstMessage.content,
  };

  return args;
}

export const transforms = {
  addAnthropicMessageCache,
  transformSystemToDeveloperMessage,
};
