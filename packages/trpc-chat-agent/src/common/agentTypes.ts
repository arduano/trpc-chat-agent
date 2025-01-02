import type { MessageContent } from './messageContent';
import type { AnyStructuredChatTool, ToolCallbackInvoker, ToolsContext } from './structuredTool';
import type {
  AgentUpdateMessage,
  ChatTree,
  ClientSideChatConversation,
  ServerSideChatConversation,
  ServerSideConversationData,
} from './types';

export type AgentTools<Agent extends ChatAgent<any>> =
  Agent extends ChatAgent<infer Tools> ? NonNullable<Tools> : never;

export type AdvancedReactAgentConversation<Agent extends ChatAgent<any>> = ServerSideChatConversation<
  AgentTools<Agent>
>;

export type AdvancedReactAgentClientConversation<Agent extends ChatAgent<any>> = ClientSideChatConversation<
  AgentTools<Agent>
>;

export type ChatAgentInvokeArgs<Tools extends readonly AnyStructuredChatTool[]> = {
  conversationData: ServerSideConversationData<Tools>;
  chatBranch: ChatTree;
  humanMessageContent: MessageContent;
  ctx: ToolsContext<Tools>;
  callbackInvoker: ToolCallbackInvoker;
  controller: AbortController;
};

export type ChatAgent<Tools extends readonly AnyStructuredChatTool[] = any> = {
  invoke: (args: ChatAgentInvokeArgs<Tools>) => AsyncIterableIterator<AgentUpdateMessage>;
};
