import type { BaseMessage } from '@langchain/core/messages';
import type { AnyStructuredChatTool } from '@trpc-chat-agent/core';
import type { GetRunContext } from 'bee-agent-framework/context';
import type { BaseToolRunOptions } from 'bee-agent-framework/tools/base';
import type { CreateChatAgentArgs } from './chatAgent';
import type { AnyStructuredChatToolBee } from './tool';
import { AgentsBackend } from '@trpc-chat-agent/core';
import { createChatAgentLangchain } from './chatAgent';

export type LangchainToolExtraArgs = readonly [
  Partial<BaseToolRunOptions>,
  GetRunContext<AnyStructuredChatToolBee, any>,
];
export class BeeAgentsBackend extends AgentsBackend<LangchainToolExtraArgs, BaseMessage, BaseMessage> {
  constructor() {
    super();
  }

  public createAgent = <Tools extends readonly AnyStructuredChatTool[]>(args: CreateChatAgentArgs<Tools>) => {
    return createChatAgentLangchain(args);
  };
}
