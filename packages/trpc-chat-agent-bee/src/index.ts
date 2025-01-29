import type { BaseMessage } from '@langchain/core/messages';
import type { GetRunContext } from 'bee-agent-framework/context';
import type { BaseToolRunOptions } from 'bee-agent-framework/tools/base';
import type { AnyStructuredChatToolBee } from './tool';
import { AgentsBackend } from '@trpc-chat-agent/core';

export type LangchainToolExtraArgs = readonly [
  Partial<BaseToolRunOptions>,
  GetRunContext<AnyStructuredChatToolBee, any>,
];
// TODO: Get around to this
// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
export class BeeAgentsBackend extends AgentsBackend<LangchainToolExtraArgs, BaseMessage, BaseMessage> {
  constructor() {
    super();
  }

  // public createAgent = <Tools extends readonly AnyStructuredChatTool[]>(args: CreateChatAgentArgs<Tools>) => {
  //   return createChatAgentLangchain(args);
  // };

  // TODO: Get around to this
  public createAgent = null as any;
}
