import type { MessageContent } from './messageContent';
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
export type AgentTools<AgentOrTools extends ChatAgent<any> | readonly AnyStructuredChatTool[]> =
  AgentOrTools extends AnyStructuredChatTool[]
    ? NonNullable<AgentOrTools>
    : AgentOrTools extends ChatAgent<infer Tools>
      ? NonNullable<Tools>
      : never;

export type AdvancedReactAgentConversation<Agent extends ChatAgent<any>> = ServerSideChatConversation<
  AgentTools<Agent>
>;

export type AdvancedReactAgentClientConversation<Agent extends ChatAgent<any>> = ClientSideChatConversation<
  AgentTools<Agent>
>;

export type ChatAgentInvokeArgs<Tools extends readonly AnyStructuredChatTool[]> = {
  conversationData: ServerSideConversationData<Tools>;
  chatBranch: ChatTreePath;
  humanMessageContent: MessageContent;
  ctx: ToolsContext<Tools>;
  callbackInvoker: ToolCallbackInvoker;
  controller: AbortController;
};

export type ChatAgent<Tools extends readonly AnyStructuredChatTool[]> = {
  invoke: (args: ChatAgentInvokeArgs<Tools>) => AsyncIterableIterator<AgentUpdateMessage>;
};

export type ChatAgentOrTools = ChatAgent<any> | readonly AnyStructuredChatTool[];
