import type { AnyStructuredChatTool, StructuredChatTool, ToolCallOutput } from '@trpc-chat-agent/core';
import type { GetRunContext } from 'bee-agent-framework/context';
import type { AnyToolSchemaLike, FromSchemaLike } from 'bee-agent-framework/internals/helpers/schema';
import type { BaseToolOptions, BaseToolRunOptions, ToolEvents, ToolOutput } from 'bee-agent-framework/tools/base';
import type { z } from 'zod';
import type { LangchainToolExtraArgs } from '.';
import { Emitter } from 'bee-agent-framework/emitter/emitter';
import { Tool } from 'bee-agent-framework/tools/base';

export class StructuredChatToolBee<
  Args extends z.AnyZodObject,
  ResultForClient = undefined,
  Context = any,
> extends Tool {
  name: string;
  description: string;
  declare readonly emitter: Emitter<ToolEvents<FromSchemaLike<Args>>>;
  schema: Args;

  inputSchema(): Promise<AnyToolSchemaLike> | AnyToolSchemaLike {
    return this.schema;
  }

  constructor(
    private readonly tool: StructuredChatTool<
      string,
      Args,
      any,
      ToolOutput,
      any,
      ResultForClient,
      Context,
      any,
      LangchainToolExtraArgs
    >
  ) {
    super({});

    this.name = tool.name;
    this.description = tool.description;
    this.schema = tool.schema;
    this.emitter = Emitter.root.child({
      namespace: ['tool', 'trpcChatAgent', this.name],
      creator: this,
    });
  }

  protected async _run(
    arg: FromSchemaLike<Awaited<ReturnType<this['inputSchema']>>>,
    options: Partial<BaseToolRunOptions>,
    run: GetRunContext<this, any>
  ): Promise<ToolOutput> {
    const data = await this.tool.invoke(arg, options, run);
    return data.response;
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
}

export type AnyStructuredChatToolBee = StructuredChatToolBee<any, any, any>;

export function mockStructuredChatToolBeeCall(tool: AnyStructuredChatTool, args: any, options?: BaseToolOptions) {
  // Create/call a wrapper that makes Bee think we called their tool class
  // when instead we just used it to call our own

  return new Promise<ToolCallOutput<ToolOutput, any>>((resolve, reject) => {
    class ChatToolBee extends Tool {
      name: string;
      description: string;
      emitter: Emitter<ToolEvents<any, ToolOutput>>;
      schema: any;

      constructor(private readonly tool: AnyStructuredChatTool) {
        super({});

        this.name = tool.name;
        this.description = tool.description;
        this.schema = tool.schema;
        this.emitter = Emitter.root.child({
          namespace: ['tool', 'trpcChatAgent', this.name],
          creator: this,
        });
      }

      inputSchema(): Promise<AnyToolSchemaLike> | AnyToolSchemaLike {
        return this.schema;
      }

      protected async _run(
        arg: FromSchemaLike<Awaited<ReturnType<this['inputSchema']>>>,
        options: Partial<BaseToolRunOptions>,
        run: GetRunContext<this, any>
      ): Promise<ToolOutput> {
        try {
          const result = await this.tool.invoke(arg, options, run);
          resolve(result);
          return result.response;
        } catch (error) {
          reject(error);
          return Promise.reject(error);
        }
      }
    }

    // Invoke the tool
    const toolBee = new ChatToolBee(tool);
    toolBee.run(args, options).catch(reject);
  });
}
