import type { MessageContent } from '@langchain/core/messages';
import type { DeepPartial } from '@trpc/server';
import type { z, ZodType } from 'zod';
import type { ToolRunFn, ZodObjectAny } from './tool';
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
    Args extends ZodObjectAny,
    ToolProgressData extends ZodType<any> | undefined = undefined,
    Return = undefined,
    ArgsForClient = undefined,
    ResultForClient = undefined,
    // eslint-disable-next-line ts/no-empty-object-type
    Callbacks extends Record<string, any> = {},
  >(args: {
    name: Name;
    schema: Args;
    toolProgressSchema?: ToolProgressData;
    description: string;
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
}
