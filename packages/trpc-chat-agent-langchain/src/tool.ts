import type { RunnableConfig } from '@langchain/core/runnables';
import type { StructuredChatTool, ToolCallInput, ToolCallOutput } from '@trpc-chat-agent/core';
import type { z } from 'zod';
import type { LangchainToolExtraArgs } from '.';
import { CallbackManager, parseCallbackConfigArg } from '@langchain/core/callbacks/manager';
import { BaseLangChain } from '@langchain/core/language_models/base';
import { ToolInputParsingException } from '@langchain/core/tools';

export class StructuredChatToolLangChain<
  Args extends z.AnyZodObject = z.AnyZodObject,
  ResultForClient = undefined,
  Context = any,
  ExtraArgs extends z.AnyZodObject = z.AnyZodObject,
> extends BaseLangChain<ToolCallInput<Args, ExtraArgs, Context, any>, ToolCallOutput<ResultForClient>> {
  name: string;
  description: string;
  schema: Args;

  constructor(
    private readonly tool: StructuredChatTool<
      string,
      Args,
      any,
      any,
      ResultForClient,
      Context,
      any,
      LangchainToolExtraArgs,
      ExtraArgs
    >
  ) {
    super({});

    this.name = tool.name;
    this.description = tool.description;
    this.schema = tool.schema;
  }

  get lc_namespace() {
    // Not sure what would be the right value here because it's not part of langchain, but I'll
    // leave it as-is just in case.
    return ['langchain', 'tools'];
  }

  get mapErrorForAI() {
    return this.tool.mapErrorForAI;
  }

  get mapArgsForClient() {
    return this.tool.mapArgsForClient;
  }

  get makeDebouncedArgsMapper() {
    return this.tool.makeDebouncedArgsMapper;
  }

  async invoke(
    args: ToolCallInput<Args, ExtraArgs, Context, any>,
    config?: RunnableConfig
  ): Promise<ToolCallOutput<ResultForClient>> {
    let parsed;
    try {
      parsed = await this.schema.parseAsync(args.input);
    } catch (e: any) {
      const message = `Received tool input did not match expected schema\nDetails: ${e.message}`;
      throw new ToolInputParsingException(message, JSON.stringify(args.input));
    }

    const parsedConfig = parseCallbackConfigArg(config);
    const callbackManager_ = CallbackManager.configure(
      parsedConfig.callbacks,
      this.callbacks,
      parsedConfig.tags,
      this.tags,
      parsedConfig.metadata,
      this.metadata,
      { verbose: this.verbose }
    );
    const runManager = await callbackManager_?.handleToolStart(
      this.toJSON(),
      typeof parsed === 'string' ? parsed : JSON.stringify(parsed),
      parsedConfig.runId,
      undefined,
      undefined,
      undefined,
      parsedConfig.runName
    );
    delete parsedConfig.runId;

    try {
      const result = await this.tool.invoke(args, runManager, parsedConfig);
      return result;
    } catch (e: any) {
      await runManager?.handleToolError(e);
      throw e;
    }
  }
}
