import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { AnyStructuredChatTool, MessageContent } from '@trpc-chat-agent/core';
import type { CreateChatAgentArgs } from './chatAgent';
import { AgentsBackend } from '@trpc-chat-agent/core';
import { z } from 'zod';
import { createChatAgentLangchain } from './chatAgent';

export type LangchainToolExtraArgs = readonly [CallbackManagerForToolRun | undefined, RunnableConfig];
class LangChainAgentsBackend<ExtraExternalArgs extends z.ZodTypeAny> extends AgentsBackend<
  LangchainToolExtraArgs,
  BaseMessage,
  MessageContent,
  ExtraExternalArgs
> {
  constructor(readonly extraArgsSchema: ExtraExternalArgs) {
    super();
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

export const langchainBackend = new LangChainAgentsBackend(z.never());
