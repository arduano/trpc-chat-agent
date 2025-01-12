import type { z } from 'zod';
import type { AnyStructuredChatTool, ToolCallbackInvoker, ToolsContext } from './structuredTool';
import type { AgentUpdateMessage, ChatTreePath, ServerSideConversation } from './types';

/**
 * Takes an agent type or tools type, and returns the tools type
 */
export type AgentTools<AgentOrTools extends ChatAgentOrTools> = AgentOrTools extends readonly AnyStructuredChatTool[]
  ? AgentOrTools
  : AgentOrTools extends AnyStructuredChatTool
    ? [AgentOrTools]
    : AgentOrTools extends ChatAgent<infer Tools, any>
      ? Tools
      : never;

export type AgentExtraArgsZod<Agent extends AnyChatAgent> =
  Agent extends ChatAgent<any, infer ZodType> ? ZodType : never;

export type AgentExtraArgs<Agent extends AnyChatAgent> = z.infer<AgentExtraArgsZod<Agent>>;

export type ChatAgentInvokeArgs<
  Tools extends readonly AnyStructuredChatTool[],
  ExtraInvokeArgs extends z.ZodTypeAny,
> = {
  conversationData: ServerSideConversation<Tools>;
  chatPath: ChatTreePath;
  ctx: ToolsContext<Tools>;
  callbackInvoker: ToolCallbackInvoker;
  signal: AbortSignal;
  extraArgs: z.infer<ExtraInvokeArgs>;
};

export type ChatAgent<Tools extends readonly AnyStructuredChatTool[], ExtraInvokeArgs extends z.ZodTypeAny> = {
  invoke: (args: ChatAgentInvokeArgs<Tools, ExtraInvokeArgs>) => AsyncIterableIterator<AgentUpdateMessage>;
  extraArgsSchema: ExtraInvokeArgs;
};

export type AnyChatAgent = ChatAgent<any, any>;

export type ChatAgentOrTools = AnyChatAgent | readonly AnyStructuredChatTool[] | AnyStructuredChatTool;
