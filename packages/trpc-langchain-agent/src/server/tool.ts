import type { MessageContent } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { z, ZodType } from 'zod';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import {
  CallbackManager,
  type CallbackManagerForToolRun,
  parseCallbackConfigArg,
} from '@langchain/core/callbacks/manager';
import { BaseLangChain } from '@langchain/core/language_models/base';
import { ToolInputParsingException } from '@langchain/core/tools';
import { Debouncer } from '../common/debounce';

type DeepPartial<T> = T extends Record<string, infer U> ? { [K in keyof T]?: DeepPartial<U> } : T;

type ZodObjectAny = z.ZodObject<any, any, any, any>;

export class StructuredChatTool<
  Name extends string,
  Args extends ZodObjectAny,
  ToolProgressData extends ZodType<any> | undefined = undefined,
  Return = undefined,
  ArgsForClient = undefined,
  ResultForClient = undefined,
  Context = any,
  Callbacks = Record<string, any>,
> extends BaseLangChain<
  { input: z.infer<Args>; ctx: Context; callbacks: Callbacks },
  { response: Return; clientResult: ResultForClient }
> {
  // Helpers for type inference. These don't actually exist as values.
  TypeInfo: {
    Name: Name;
    Schema: Args;
    Args: z.infer<Args>;
    ToolProgressSchema: ToolProgressData;
    ToolProgress: ToolProgressData extends undefined ? undefined : z.infer<NonNullable<ToolProgressData>>;
    Return: Return;
    ArgsForClient: ArgsForClient;
    ResultForClient: ResultForClient;
    Context: Context;
    Callbacks: Callbacks;
  } = undefined as any;

  name: string;
  description: string;
  schema: Args;

  constructor(
    private readonly toolArgs: {
      name: Name;
      schema: Args;
      toolProgressSchema?: ToolProgressData;
      description: string;
      run: (
        args: {
          input: z.infer<Args>;
          ctx: Context;
          callbacks: Callbacks;
          sendProgress: ToolProgressData extends undefined
            ? never
            : (data: z.infer<NonNullable<ToolProgressData>>) => void;
        },
        runManager?: CallbackManagerForToolRun,
        config?: RunnableConfig
      ) => Promise<{ response: Return; clientResult: ResultForClient }>;
      mapErrorForAI?: (error: unknown) => MessageContent;
      mapArgsForClient?: (args: DeepPartial<z.infer<Args>>) => ArgsForClient;
    }
  ) {
    super({});

    this.name = toolArgs.name;
    this.description = toolArgs.description;
    this.schema = toolArgs.schema;
  }

  makeDebouncedArgsMapper(debounceMs: number, send: (args: ArgsForClient) => void) {
    const mapArgs = this.mapArgsForClient;
    if (!mapArgs) {
      return null;
    }

    return new Debouncer(debounceMs, (args: DeepPartial<z.infer<Args>>) => {
      const argsForClient = mapArgs(args);
      send(argsForClient);
    });
  }

  get mapArgsForClient() {
    return this.toolArgs.mapArgsForClient;
  }

  get mapErrorForAI() {
    return this.toolArgs.mapErrorForAI;
  }

  get lc_namespace() {
    // Not sure what would be the right value here because it's not part of langchain, but I'll
    // leave it as-is just in case.
    return ['langchain', 'tools'];
  }

  async invoke(
    args: { input: z.infer<Args>; ctx: Context; callbacks: Callbacks },
    config?: RunnableConfig
  ): Promise<{ response: Return; clientResult: ResultForClient }> {
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
      const result = await this.toolArgs.run(
        {
          input: parsed,
          ctx: args.ctx,
          callbacks: args.callbacks,
          sendProgress: ((
            data: ToolProgressData extends undefined ? undefined : z.infer<NonNullable<ToolProgressData>>
          ) => {
            dispatchCustomEvent('on_structured_tool_progress', data, parsedConfig);
          }) as any,
        },
        runManager,
        parsedConfig
      );
      return result;
    } catch (e: any) {
      await runManager?.handleToolError(e);
      throw e;
    }
  }
}

export type AnyStructuredChatTool = StructuredChatTool<string, any, any, any, any, any>;
