import type { AdvancedReactAgent } from '../server';
import type { ClientSideChatConversation, ServerSideChatConversation } from './types';

export type AgentTools<Agent extends AdvancedReactAgent<any>> =
  Agent extends AdvancedReactAgent<infer Tools> ? NonNullable<Tools> : never;

export type AdvancedReactAgentConversation<Agent extends AdvancedReactAgent<any>> = ServerSideChatConversation<
  AgentTools<Agent>
>;

export type AdvancedReactAgentClientConversation<Agent extends AdvancedReactAgent<any>> = ClientSideChatConversation<
  AgentTools<Agent>
>;
