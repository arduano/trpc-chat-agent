import { Runnable } from '@langchain/core/runnables';
import { AnyStructuredChatTool } from './structuredTool';
import type { ClientSideChatConversation, ServerSideChatConversation } from './types';

export type AgentTools<Agent extends ChatAgent<any>> =
  Agent extends ChatAgent<infer Tools> ? NonNullable<Tools> : never;

export type AdvancedReactAgentConversation<Agent extends ChatAgent<any>> = ServerSideChatConversation<
  AgentTools<Agent>
>;

export type AdvancedReactAgentClientConversation<Agent extends ChatAgent<any>> = ClientSideChatConversation<
  AgentTools<Agent>
>;

export type ChatAgent<Tools extends readonly AnyStructuredChatTool[] = any> = Runnable & {
  // Not real data, just a marker type
  __toolTypes?: Tools;
};
