import type { MessageContent } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { DeepPartial } from '@trpc/server';
import type { z } from 'zod';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import {
  CallbackManager,
  type CallbackManagerForToolRun,
  parseCallbackConfigArg,
} from '@langchain/core/callbacks/manager';
import { BaseLangChain } from '@langchain/core/language_models/base';
import { ToolInputParsingException } from '@langchain/core/tools';
import { Debouncer } from '../common/debounce';
import { AnyToolCallback, CallbackFunctions } from './callback';

export type ToolRunFn<
  Args extends z.AnyZodObject,
  Context,
  Callbacks extends Record<string, AnyToolCallback>,
  ToolProgressData extends z.ZodTypeAny | undefined,
  Return,
  ResultForClient,
> = (
  args: {
    input: z.infer<Args>;
    ctx: Context;
    callbacks: CallbackFunctions<Callbacks>;
    sendProgress: ToolProgressData extends undefined ? never : (data: z.infer<NonNullable<ToolProgressData>>) => void;
  },
  runManager?: CallbackManagerForToolRun,
  config?: RunnableConfig
) => Promise<ToolCallOutput<Return, ResultForClient>>;

export type ToolCallbackInvoker = (args: {
  callbackArgs: any;
  responseSchema: z.ZodTypeAny;
  toolCallId: string;
  toolName: string;
  callbackName: string;
}) => Promise<any>;

type ToolCallInput<Args extends z.AnyZodObject, Context> = {
  toolCallId: string;
  input: z.infer<Args>;
  ctx: Context;
  callbackInvoker: ToolCallbackInvoker;
};

type ToolCallOutput<Return, ResultForClient> = {
  response: Return;
  clientResult: ResultForClient;
};

export class StructuredChatTool<
  Name extends string,
  Args extends z.AnyZodObject,
  ToolProgressData extends z.ZodTypeAny | undefined = undefined,
  Return = undefined,
  ArgsForClient = undefined,
  ResultForClient = undefined,
  Context = any,
  // eslint-disable-next-line ts/no-empty-object-type
  Callbacks extends Record<string, AnyToolCallback> = {},
> extends BaseLangChain<ToolCallInput<Args, Context>, ToolCallOutput<Return, ResultForClient>> {
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
      callbacks?: Callbacks;
      run: ToolRunFn<Args, Context, Callbacks, ToolProgressData, Return, ResultForClient>;
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
    args: ToolCallInput<Args, Context>,
    config?: RunnableConfig
  ): Promise<ToolCallOutput<Return, ResultForClient>> {
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
      const allCallbacks = Object.fromEntries(
        Object.entries(this.toolArgs.callbacks ?? {}).map(([name, callback]) => {
          return [
            name,
            (callArgs: any) =>
              args.callbackInvoker({
                callbackArgs: callArgs,
                responseSchema: callback.schema,
                toolCallId: args.toolCallId,
                toolName: this.name,
                callbackName: name,
              }),
          ];
        })
      );

      const result = await this.toolArgs.run(
        {
          input: parsed,
          ctx: args.ctx,
          callbacks: allCallbacks as CallbackFunctions<Callbacks>,
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
