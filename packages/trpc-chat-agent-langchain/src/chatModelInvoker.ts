import type { AnthropicInput } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import type { IterableReadableStream } from '@langchain/core/utils/stream';
import type { AnthropicCacheLevel } from './anthropicCache';
import type { StructuredChatToolLangChain } from './tool';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatBedrockConverse } from '@langchain/aws';
import { SystemMessage } from '@langchain/core/messages';
import { AzureChatOpenAI, ChatOpenAI } from '@langchain/openai';
import { concatMessageContent } from '@trpc-chat-agent/core';
import { addAnthropicMessageCache } from './anthropicCache';

export type ChatModelInvokerArgs = {
  messages: BaseMessage[];
  tools?: StructuredChatToolLangChain<any>[];
  config: RunnableConfig;
  signal: AbortSignal;
};

/**
 * A class for defining a model invoker.
 *
 * It exists as a class for stronger runtime type definitions.
 */
export class ChatModelInvoker {
  constructor(
    private readonly invokeFn: (args: ChatModelInvokerArgs) => Promise<IterableReadableStream<StreamEvent>>
  ) {}

  invoke(args: ChatModelInvokerArgs): Promise<IterableReadableStream<StreamEvent>> {
    return this.invokeFn(args);
  }
}

type CommonModelArgs = {
  /** Temperature to use. */
  temperature?: number;
  /** Maximum number of tokens to use. */
  maxTokens?: number;
};

export const models = {
  /**
   * Initializes a new OpenAI model.
   */
  openai(
    args: CommonModelArgs & {
      /** The name of the OpenAI model to use. */
      model: string;
      /** The API key for authentication with OpenAI. Uses `OPENAI_API_KEY` by default. */
      apiKey?: string;
      /** The base URL for the OpenAI-compatible API endpoint. Optionally uses `OPENAI_API_BASE` by default. */
      baseUrl?: string;
      /** The reasoning_effort parameter to pass to OpenAI's API. Only applicable for o-series models. */
      reasoningEffort?: 'low' | 'medium' | 'high';
      /** Treat this as an o-series model. Defaults to `model.startsWith('o')` */
      isOSeries?: boolean;
    }
  ) {
    const model = new ChatOpenAI({
      apiKey: args.apiKey ?? process.env.OPENAI_API_KEY,
      model: args.model,
      configuration: {
        baseURL: args.baseUrl ?? process.env.OPENAI_API_BASE,
      },
      temperature: args.temperature,
      maxTokens: args.maxTokens,
    });

    return openaiWrapperForModel({ model, isOSeries: args.isOSeries, reasoningEffort: args.reasoningEffort });
  },

  /**
   * Initializes a new OpenAI model.
   */
  azureOpenAi(
    args: CommonModelArgs & {
      /** The name of the OpenAI model to use. */
      model: string;
      /** The name of the Azure OpenAI deployment. Defaults to `model` */
      deploymentName?: string;
      /** The API key for authentication with OpenAI. Uses `AZURE_OPENAI_API_KEY` by default. */
      apiKey?: string;
      /** The Azure OpenAI API version. Uses `AZURE_OPENAI_API_VERSION` by default. */
      apiVersion?: string;
      /** The Azure OpenAI API instance name. Uses `AZURE_OPENAI_API_INSTANCE_NAME` by default. */
      apiInstanceName?: string;
      /** The reasoning_effort parameter to pass to OpenAI's API. Only applicable for o-series models. */
      reasoningEffort?: 'low' | 'medium' | 'high';
      /** Treat this as an o-series model. Defaults to `model.startsWith('o')` */
      isOSeries?: boolean;
    }
  ) {
    const model = new AzureChatOpenAI({
      apiKey: args.apiKey ?? process.env.AZURE_OPENAI_API_KEY,
      openAIApiVersion: args.apiVersion ?? process.env.AZURE_OPENAI_API_VERSION,
      azureOpenAIApiInstanceName: args.apiInstanceName ?? process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      model: args.model,
      deploymentName: args.deploymentName ?? args.model,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
    });

    return openaiWrapperForModel({ model, isOSeries: args.isOSeries, reasoningEffort: args.reasoningEffort });
  },

  /**
   * Initializes a new Anthropic model.
   *
   * Automatically applies Anthropic model prompt caching onto:
   * - The last tool
   * - The system message
   * - The second last user message
   * - The last user message
   *
   * Prompt caching can be configured with `anthropicCacheLevel`
   */
  anthropic(
    args: CommonModelArgs & {
      /** The name of the OpenAI model to use. */
      model: string;
      /** The API key for authentication with OpenAI. Uses `ANTHROPIC_API_KEY` by default. */
      apiKey?: string;
      /** The prompt caching level to use. Defaults to `Everything`. */
      anthropicCacheLevel?: AnthropicCacheLevel;
      /** Options for extended model thinking. */
      thinking?: AnthropicInput['thinking'];
    }
  ) {
    const model = new ChatAnthropic({
      apiKey: args.apiKey,
      model: args.model,
      thinking: args.thinking,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
    });

    return anthropicWrapperForModel({ model, anthropicCacheLevel: args.anthropicCacheLevel });
  },

  /**
   * Initializes a new Anthropic model.
   *
   * Automatically applies Anthropic model prompt caching onto:
   * - The last tool
   * - The system message
   * - The second last user message
   * - The last user message
   *
   * Prompt caching can be configured with `anthropicCacheLevel`
   */
  amazonBedrock(
    args: CommonModelArgs & {
      /** The name of the OpenAI model to use. */
      model: string;
      /** The AWS Bedrock region to use. Uses `BEDROCK_AWS_REGION` by default. */
      region?: string;
      /** The AWS credentials to use. Uses `BEDROCK_AWS_ACCESS_KEY_ID` and `BEDROCK_AWS_SECRET_ACCESS_KEY` by default. */
      credentials?: {
        /** The AWS access key ID. Uses `BEDROCK_AWS_ACCESS_KEY_ID` by default. */
        accessKeyId?: string;
        /** The AWS secret access key. Uses `BEDROCK_AWS_SECRET_ACCESS_KEY` by default. */
        secretAccessKey?: string;
      };
      /** The prompt caching level to use. Defaults to `Everything`. */
      anthropicCacheLevel?: AnthropicCacheLevel;
      /** Options for extended model thinking. */
      thinking?: AnthropicInput['thinking'];
    }
  ) {
    const model = new ChatBedrockConverse({
      model: args.model,
      region: args.region ?? process.env.BEDROCK_AWS_REGION,
      credentials: {
        accessKeyId: args.credentials?.accessKeyId ?? process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
        secretAccessKey: args.credentials?.secretAccessKey ?? process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
      },
      additionalModelRequestFields: {
        thinking: args.thinking as any,
      },
      maxTokens: args.maxTokens,
      temperature: args.temperature,
    });

    return anthropicWrapperForModel({ model, anthropicCacheLevel: args.anthropicCacheLevel });
  },

  /**
   * Infers a ChatModelInvoker from a Langchain BaseChatModel
   *
   * For ChatOpenAI instances:
   * - Uses `models.openaiOSeries` if the model name starts with `o`
   * - Uses `models.openai` otherwise
   *
   * For Anthropic instances:
   * - Uses `models.anthropic` with `Everything` caching
   *
   * Throws otherwise
   */
  inferFromLangchainModel({ model }: { model: BaseChatModel }) {
    if (model instanceof ChatOpenAI) {
      return openaiWrapperForModel({ model });
    } else if (model instanceof AzureChatOpenAI) {
      return openaiWrapperForModel({ model });
    } else if (model instanceof ChatAnthropic) {
      return anthropicWrapperForModel({ model });
    } else if (model instanceof ChatBedrockConverse) {
      return anthropicWrapperForModel({ model });
    }

    // Throws
    throw new Error(`Could not infer ChatModelInvoker from model: ${model}\nPlease choose a compatible model class`);
  },
} satisfies Record<string, (args: any) => ChatModelInvoker>;

export type ChatModelOrInvoker = BaseChatModel | ChatModelInvoker;

export function chatModelToInvoker(model: ChatModelOrInvoker) {
  if (model instanceof ChatModelInvoker) {
    return model;
  } else {
    return models.inferFromLangchainModel({ model });
  }
}

function openaiWrapperForModel(args: {
  model: ChatOpenAI | AzureChatOpenAI;
  isOSeries?: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high';
}) {
  return new ChatModelInvoker(async ({ messages, tools, config, signal }) => {
    const isOSeries = args.isOSeries ?? args.model.model.startsWith('o');

    const modelWithTools = tools?.length ? args.model.bindTools(tools) : args.model;

    if (isOSeries) {
      messages = appendFormattingReenabledToFirstMessage(messages);
    }

    return modelWithTools
      .bind({
        reasoning_effort: isOSeries ? args.reasoningEffort : undefined,
      })
      .streamEvents(messages, {
        ...config,
        version: 'v2',
        signal,
      });
  });
}

function anthropicWrapperForModel(args: {
  model: ChatAnthropic | ChatBedrockConverse;
  anthropicCacheLevel?: AnthropicCacheLevel;
}) {
  return new ChatModelInvoker(async ({ messages, tools, config, signal }) => {
    const { tools: mappedTools, messages: mappedMessages } = addAnthropicMessageCache({
      messages,
      tools: tools ?? [],
      anthropicCacheLevel: args.anthropicCacheLevel,
    });

    // Cast to ChatAnthropic for simpler typing., it's still compatible either way though
    const modelWithTools = (tools?.length ? args.model.bindTools(mappedTools as any) : args.model) as ChatAnthropic;

    return modelWithTools.streamEvents(mappedMessages as any, {
      ...config,
      version: 'v2',
      signal,
    });
  });
}

/** Appends "Formatting re-enabled\n\n" to the first message if it's a system message */
function appendFormattingReenabledToFirstMessage(messages: BaseMessage[]) {
  return messages.map((message, i) => {
    if (i === 0 && message instanceof SystemMessage) {
      return new SystemMessage({
        ...message.toDict().data,
        content: concatMessageContent('Formatting re-enabled\n\n', message.content),
      });
    } else {
      return message;
    }
  });
}
