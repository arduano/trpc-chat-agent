import type { MessageContent } from '@langchain/core/messages';
import type { DeepPartial } from '@trpc/server';
import type { z, ZodType } from 'zod';
import type { AnyToolCallback, ToolCallback } from './callback';
import type { ToolRunFn } from './tool';
import { StructuredChatTool } from './tool';

export class InitAgents<Context = any> {
  constructor() {}

  public context<NewCtx>(): InitAgents<NewCtx extends () => any ? Awaited<ReturnType<NewCtx>> : NewCtx> {
    return new InitAgents<NewCtx extends () => any ? Awaited<ReturnType<NewCtx>> : NewCtx>();
  }

  public create(): AgentBuilder<Context> {
    return new AgentBuilder<Context>();
  }
}

export const initAgents = new InitAgents();

class AgentBuilder<Context> {
  public tool<
    Name extends string,
    Args extends z.AnyZodObject,
    ToolProgressData extends ZodType<any> | undefined = undefined,
    Return = undefined,
    ArgsForClient = undefined,
    ResultForClient = undefined,
    Callbacks extends Record<string, AnyToolCallback> = Record<string, never>, // This default type is the only one that seems to work, {} breaks things
  >(args: {
    name: Name;
    schema: Args;
    toolProgressSchema?: ToolProgressData;
    description: string;
    callbacks?: Callbacks;
    run: ToolRunFn<Args, Context, Callbacks, ToolProgressData, Return, ResultForClient>;
    mapErrorForAI?: (error: unknown) => MessageContent;
    mapArgsForClient?: (args: DeepPartial<z.infer<Args>>) => ArgsForClient;
  }) {
    return new StructuredChatTool<
      Name,
      Args,
      ToolProgressData,
      Return,
      ArgsForClient,
      ResultForClient,
      Context,
      Callbacks
    >(args);
  }

  public callback<Args extends z.AnyZodObject, Return extends z.AnyZodObject>(args: ToolCallback<Args, Return>) {
    return args;
  }
}
