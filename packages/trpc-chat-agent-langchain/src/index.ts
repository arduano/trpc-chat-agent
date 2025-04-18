import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { AnyStructuredChatTool } from '@trpc-chat-agent/core';
import type { CreateChatAgentArgs } from './chatAgent';
import { AgentsBackend } from '@trpc-chat-agent/core';
import { z } from 'zod';
import { createChatAgentLangchain } from './chatAgent';

export * from './chatAgent';
export * from './chatModelInvoker';

export type LangchainToolExtraArgs = readonly [CallbackManagerForToolRun | undefined, RunnableConfig];
class LangChainAgentsBackend<ExtraExternalArgs extends z.ZodTypeAny> extends AgentsBackend<
  LangchainToolExtraArgs,
  BaseMessage,
  ExtraExternalArgs
> {
  constructor(readonly extraArgsSchema: ExtraExternalArgs) {
    super();
  }

  extraArgs<NewExtraExternalArgs extends z.AnyZodObject>(schema: NewExtraExternalArgs) {
    return new LangChainAgentsBackend<NewExtraExternalArgs>(schema);
  }

  public createAgent = <Tools extends readonly AnyStructuredChatTool[]>(
    args: CreateChatAgentArgs<Tools, ExtraExternalArgs>
  ) => {
    return createChatAgentLangchain({
      ...args,
      extraExternalArgsSchema: this.extraArgsSchema,
    });
  };
}

export const langchainBackend = new LangChainAgentsBackend(z.undefined().optional());
