import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { AnyStructuredChatTool } from '@trpc-chat-agent/core';
import type { CreateChatAgentArgs } from './chatAgent';
import { AgentsBackend } from '@trpc-chat-agent/core';
import { createChatAgentLangchain } from './chatAgent';

export type LangchainToolExtraArgs = readonly [CallbackManagerForToolRun | undefined, RunnableConfig];
export class LangChainAgentsBackend extends AgentsBackend<LangchainToolExtraArgs, BaseMessage> {
  constructor() {
    super();
  }

  public createAgent = <
    Tools extends readonly AnyStructuredChatTool[],
    SelectedLlms extends BaseChatModel | Record<string, BaseChatModel>,
  >(
    args: CreateChatAgentArgs<Tools, SelectedLlms>
  ) => {
    return createChatAgentLangchain(args);
  };
}
