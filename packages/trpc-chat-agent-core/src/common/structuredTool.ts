import type { AnyToolCallback, CallbackFunctions } from 'src/server';
import type { z } from 'zod';
import type { AnyChatAgent } from './agentTypes';
import type { MessageContent } from './messageContent';
import type { AIMessageData, ChatTreePath, ServerSideChatConversationHelper, UserMessageData } from './types';
import { Debouncer } from './debounce';

export type ToolRunFn<
  Args extends z.AnyZodObject,
  Context,
  Callbacks extends Record<string, AnyToolCallback>,
  ToolProgressData extends z.ZodTypeAny | undefined,
  Return,
  ResultForClient,
  ExtraExternalArgs extends z.AnyZodObject,
  ExtraBackendArgs extends readonly any[] = [],
> = (
  args: {
    input: z.infer<Args>;
    ctx: Context;
    callbacks: CallbackFunctions<Callbacks>;
    sendProgress: ToolProgressCallback<ToolProgressData>;
    conversationId: string;
    signal: AbortSignal;
    extraArgs: z.infer<ExtraExternalArgs>;

    // We cannot infer this type as it would be circular. We have to use AnyStructuredChatTool instead.
    conversation: ServerSideChatConversationHelper<AnyChatAgent>;
    pastMessages: (UserMessageData | AIMessageData<any[]>)[];

    conversationPath: ChatTreePath;
    lastUserMessage: UserMessageData;
  },
  ...extraArgs: ExtraBackendArgs
) => Promise<ToolCallOutput<Return, ResultForClient>>;

export type ToolCallbackInvoker = (args: {
  callbackArgs: any;
  responseSchema: z.ZodTypeAny;
  toolCallId: string;
  toolName: string;
  callbackName: string;
}) => Promise<any>;

export type ToolCallInput<
  Args extends z.AnyZodObject,
  ExtraExternalArgs extends z.AnyZodObject,
  Context,
  ToolProgressData extends z.ZodTypeAny | undefined,
> = {
  toolCallId: string;
  input: z.infer<Args>;
  ctx: Context;
  callbackInvoker: ToolCallbackInvoker;
  progressCallback: ToolProgressCallback<ToolProgressData>;
  signal: AbortSignal;
  conversation: ServerSideChatConversationHelper<AnyChatAgent>;
  conversationPath: ChatTreePath;
  lastUserMessage: UserMessageData;
  pastMessages: (UserMessageData | AIMessageData<any[]>)[];
  extraArgs: z.infer<ExtraExternalArgs>;
};

export type ToolCallOutput<Return, ResultForClient> = {
  response: Return;
  clientResult: ResultForClient;
};

export type ToolProgressCallback<ToolProgressData extends z.ZodTypeAny | undefined> = ToolProgressData extends undefined
  ? never
  : (data: z.infer<NonNullable<ToolProgressData>>) => void;

type DeepPartial<TObject> = TObject extends object
  ? {
      [P in keyof TObject]?: DeepPartial<TObject[P]>;
    }
  : TObject;

export class StructuredChatTool<
  Name extends string,
  Args extends z.AnyZodObject,
  ToolProgressData extends z.ZodTypeAny | undefined = undefined,
  Return = undefined,
  ArgsForClient = undefined,
  ResultForClient = undefined,
  Context = any,
  Callbacks extends Record<string, AnyToolCallback> = Record<string, never>, // This default type is the only one that seems to work, {} breaks things
  ExtraBackendArgs extends readonly any[] = readonly any[],
  ExtraExternalArgs extends z.AnyZodObject = z.AnyZodObject,
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
      callbacks?: Callbacks;
      run: ToolRunFn<
        Args,
        Context,
        Callbacks,
        ToolProgressData,
        Return,
        ResultForClient,
        ExtraExternalArgs,
        ExtraBackendArgs
      >;
      mapErrorForAI?: (error: unknown) => MessageContent;
      mapArgsForClient?: (args: DeepPartial<z.infer<Args>>) => ArgsForClient;
    }
  ) {
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

  async invoke(
    args: ToolCallInput<Args, ExtraExternalArgs, Context, ToolProgressData>,
    ...extraRunArgs: ExtraBackendArgs
  ): Promise<ToolCallOutput<Return, ResultForClient>> {
    const allCallbacks = Object.fromEntries(
      Object.entries(this.toolArgs.callbacks ?? {}).map(([name, callback]) => {
        return [
          name,
          (callArgs: any) =>
            args.callbackInvoker({
              callbackArgs: callArgs,
              responseSchema: callback.response,
              toolCallId: args.toolCallId,
              toolName: this.name,
              callbackName: name,
            }),
        ];
      })
    );

    const result = await this.toolArgs.run(
      {
        input: args.input,
        ctx: args.ctx,
        callbacks: allCallbacks as CallbackFunctions<Callbacks>,
        sendProgress: args.progressCallback as any, // `any` required because we can't assign to a conditional type
        conversationId: args.conversation.data.id,
        signal: args.signal,
        conversation: args.conversation,
        conversationPath: args.conversationPath,
        lastUserMessage: args.lastUserMessage,
        pastMessages: args.pastMessages,
        extraArgs: args.extraArgs,
      },
      ...extraRunArgs
    );
    return result;
  }
}

export type AnyStructuredChatTool = StructuredChatTool<string, any, any, any, any, any, any, any, readonly any[]>;

export type ToolsContext<Tools extends readonly AnyStructuredChatTool[]> = Tools[number]['TypeInfo']['Context'];
