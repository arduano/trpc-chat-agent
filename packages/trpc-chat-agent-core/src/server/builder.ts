import type { MessageContent } from '@langchain/core/messages';
import type { DeepPartial } from '@trpc/server';
import type { ZodType } from 'zod';
import type { AnyChatAgent } from '../common';
import type { ToolRunFn } from '../common/structuredTool';
import type { AnyToolCallback, ToolCallback } from './callback';
import { z } from 'zod';
import { StructuredChatTool } from '../common/structuredTool';

export abstract class AgentsBackend<
  ExtraBackendArgs extends readonly any[],
  BaseMessageType,
  ToolReturn,
  ExtraExternalArgs extends z.ZodTypeAny,
> {
  // Field to stop typescript from complaining about unused types.
  // It is never actually used.
  $types = undefined as any as {
    ExtraBackendArgs: ExtraBackendArgs;
    BaseMessageType: BaseMessageType;
    ToolReturn: ToolReturn;
    ExtraExternalArgs: ExtraExternalArgs;
  };

  abstract extraArgsSchema: ExtraExternalArgs;

  abstract createAgent: (...args: any[]) => AnyChatAgent;
}

type AnyAgentsBackend = AgentsBackend<readonly any[], any, any, any>;

export class NoBackend extends AgentsBackend<[], never, never, z.ZodNever> {
  createAgent = () => {
    throw new Error('No backend provided');
  };

  extraArgsSchema = z.never();

  constructor() {
    super();
  }
}

export class InitAgents<Context, ExtraArgs extends z.AnyZodObject, Backend extends AnyAgentsBackend> {
  constructor(
    readonly chosenBackend: Backend,
    readonly extraArgsSchema: ExtraArgs
  ) {}

  public context<NewCtx>(): InitAgents<
    NewCtx extends () => any ? Awaited<ReturnType<NewCtx>> : NewCtx,
    ExtraArgs,
    Backend
  > {
    return new InitAgents<NewCtx extends () => any ? Awaited<ReturnType<NewCtx>> : NewCtx, ExtraArgs, Backend>(
      this.chosenBackend,
      this.extraArgsSchema
    );
  }

  public backend<NewBackend extends AnyAgentsBackend>(backend: NewBackend): InitAgents<Context, ExtraArgs, NewBackend> {
    return new InitAgents<Context, ExtraArgs, NewBackend>(backend, this.extraArgsSchema);
  }

  private createImpl() {
    return new AgentBuilder<Context, Backend>(this.chosenBackend);
  }

  // Only expose create if we have a backend
  create: Backend extends NoBackend ? never : () => AgentBuilder<Context, Backend> = (() => this.createImpl()) as any;
}

export const initAgents = new InitAgents(new NoBackend(), z.object({}));

class AgentBuilder<Context, Backend extends AnyAgentsBackend> {
  constructor(readonly backend: Backend) {}

  public tool<
    const Name extends string,
    const Args extends z.AnyZodObject,
    const ToolProgressData extends ZodType<any> | undefined = undefined,
    const ArgsForClient = undefined,
    const ResultForClient = undefined,
    const Callbacks extends Record<string, AnyToolCallback> = Record<string, never>, // This default type is the only one that seems to work, {} breaks things
  >(args: {
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
      Backend['$types']['ToolReturn'],
      ResultForClient,
      Backend['$types']['ExtraExternalArgs'],
      Backend['$types']['ExtraBackendArgs']
    >;
    mapErrorForAI?: (error: unknown) => MessageContent;
    mapArgsForClient?: (args: DeepPartial<z.infer<Args>>) => ArgsForClient;
  }) {
    return new StructuredChatTool<
      Name,
      Args,
      ToolProgressData,
      Backend['$types']['ToolReturn'],
      ArgsForClient,
      ResultForClient,
      Context,
      Callbacks,
      Backend['$types']['ExtraBackendArgs'],
      Backend['$types']['ExtraExternalArgs']
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
