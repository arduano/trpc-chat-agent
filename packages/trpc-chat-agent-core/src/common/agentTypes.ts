import type { AnyStructuredChatTool, ToolCallbackInvoker, ToolsContext } from './structuredTool';
import type {
  AgentUpdateMessage,
  ChatTreePath,
  ClientSideChatConversation,
  ServerSideChatConversation,
  ServerSideConversationData,
} from './types';

/**
 * Takes an agent type or tools type, and returns the tools type
 */
export type AgentTools<AgentOrTools extends ChatAgentOrTools> = AgentOrTools extends readonly AnyStructuredChatTool[]
  ? AgentOrTools
  : AgentOrTools extends AnyStructuredChatTool
    ? [AgentOrTools]
    : AgentOrTools extends ChatAgent<infer Tools>
      ? Tools
      : never;

export type AdvancedReactAgentConversation<Agent extends ChatAgent<any>> = ServerSideChatConversation<
  AgentTools<Agent>
>;

export type AdvancedReactAgentClientConversation<Agent extends ChatAgent<any>> = ClientSideChatConversation<
  AgentTools<Agent>
>;

export type ChatAgentInvokeArgs<Tools extends readonly AnyStructuredChatTool[]> = {
  conversationData: ServerSideConversationData<Tools>;
  chatPath: ChatTreePath;
  ctx: ToolsContext<Tools>;
  callbackInvoker: ToolCallbackInvoker;
  signal: AbortSignal;
};

export type ChatAgent<Tools extends readonly AnyStructuredChatTool[]> = {
  invoke: (args: ChatAgentInvokeArgs<Tools>) => AsyncIterableIterator<AgentUpdateMessage>;
};

export type ChatAgentOrTools = ChatAgent<any> | readonly AnyStructuredChatTool[] | AnyStructuredChatTool;
