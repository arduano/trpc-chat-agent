import type { MessageContent } from '@langchain/core/messages';
import type { DeepPartial } from '@trpc/server';
import type { z, ZodType } from 'zod';
import type { ToolRunFn } from '../common/structuredTool';
import type { AnyToolCallback, ToolCallback } from './callback';
import { StructuredChatTool } from '../common/structuredTool';
import { ChatAgent } from '../common';

export abstract class AgentsBackend<ExtraArgs extends readonly any[], BaseMessageType> {
  // Field to stop typescript from complaining about unused types.
  // It is never actually used.
  $types = undefined as never | ExtraArgs | BaseMessageType;

  abstract createAgent: (...args: any[]) => ChatAgent<any>;
}

type AnyAgentsBackend = AgentsBackend<any[], any>;

type BackendExtraArgs<T extends AnyAgentsBackend> = T extends AgentsBackend<infer ExtraArgs, any> ? ExtraArgs : never;

export class NoBackend extends AgentsBackend<[], never> {
  createAgent = () => {
    throw new Error('No backend provided');
  };

  constructor() {
    super();
  }
}

export class InitAgents<Context, Backend extends AnyAgentsBackend> {
  constructor(readonly chosenBackend: Backend) {}

  public context<NewCtx>(): InitAgents<NewCtx extends () => any ? Awaited<ReturnType<NewCtx>> : NewCtx, Backend> {
    return new InitAgents<NewCtx extends () => any ? Awaited<ReturnType<NewCtx>> : NewCtx, Backend>(this.chosenBackend);
  }

  public backend<NewBackend extends AnyAgentsBackend>(backend: NewBackend): InitAgents<Context, NewBackend> {
    return new InitAgents<Context, NewBackend>(backend);
  }

  private createImpl() {
    return new AgentBuilder<Context, Backend>(this.chosenBackend);
  }

  // Only expose create if we have a backend
  create: Backend extends NoBackend ? never : () => AgentBuilder<Context, Backend> = (() => this.createImpl()) as any;
}

export const initAgents = new InitAgents(new NoBackend());

class AgentBuilder<Context, Backend extends AnyAgentsBackend> {
  constructor(readonly backend: Backend) {}

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
    run: ToolRunFn<Args, Context, Callbacks, ToolProgressData, Return, ResultForClient, BackendExtraArgs<Backend>>;
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
      Callbacks,
      BackendExtraArgs<Backend>
    >(args);
  }

  public callback<Args extends z.AnyZodObject, Return extends z.AnyZodObject>(args: ToolCallback<Args, Return>) {
    return args;
  }

  // Propagate down the backend's agent builder function
  public get agent() {
    // Casting is necessary for typescript to propagate the overridden function type
    return this.backend.createAgent as Backend['createAgent'];
  }
}
