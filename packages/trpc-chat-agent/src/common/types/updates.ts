import type { MessageContent } from '../messageContent';
import type { ChatTree } from './branching';
import type { ClientSideConversationData } from './conversation/client';
import type { ServerSideConversationData } from './conversation/server';
import type { ToolCallState } from './tools';

export type ClientUpdateMessageContent = {
  kind: 'update-content';
  conversationId: string;
  messageId: string;
  contentToAppend: MessageContent;
};

export type ClientUpdateMessageBeginToolCall = {
  kind: 'begin-tool-call';
  conversationId: string;
  messageId: string;
  toolCallId: string;
  toolCallName: string;
};

export type ClientUpdateMessageToolCall = {
  kind: 'update-tool-call';
  conversationId: string;
  messageId: string;
  toolCallId: string;
  newArgs?: any;
  newProgressStatus?: any;
  newResult?: any;
  newState?: ToolCallState;
};

export type ClientBeginNewAIMessagePart = {
  kind: 'begin-new-ai-message-part';
  conversationId: string;
  messageId: string;
};

export type ClientSyncConversation = {
  kind: 'sync-conversation';
  conversationId: string;
  conversationData: ClientSideConversationData<any>;
  branch: ChatTree;
};

export type ClientRequestCallbackResponse = {
  kind: 'request-callback-response';
  conversationId: string;
  messageId: string;
  toolCallId: string;
  callbackId: string;
  toolName: string;
  callbackName: string;
  // eslint-disable-next-line ts/no-empty-object-type
  requestArgs: {}; // Can't use "any" because of trpc issues
};

export type ClientSideConversationUpdate =
  | ClientUpdateMessageBeginToolCall
  | ClientUpdateMessageContent
  | ClientUpdateMessageToolCall
  | ClientBeginNewAIMessagePart;

export type ClientSideUpdate = ClientSyncConversation | ClientRequestCallbackResponse | ClientSideConversationUpdate;

export type ServerUpdateMessageContent = {
  kind: 'update-content';
  messageId: string;
  totalContent: MessageContent;
};

export type ServerUpdateBeginToolCall = {
  kind: 'begin-tool-call';
  messageId: string;
  toolCallId: string;
  toolCallName: string;
  newArgs?: any;
  newClientArgs?: any;
};

export type ServerUpdateMessageToolCall = {
  kind: 'update-tool-call';
  messageId: string;
  toolCallId: string;
  newResult?: any;
  newClientArgs?: any;
  newClientResult?: any;
  newState?: ToolCallState;
};

export type ServerBeginNewAIMessagePart = {
  kind: 'begin-new-ai-message-part';
  conversationId: string;
  messageId: string;
};

export type ServerSyncConversation = {
  kind: 'sync-conversation';
  conversationData: ServerSideConversationData<any>;
  tree: ChatTree;
};

export type ServerSideConversationUpdate =
  | ServerUpdateBeginToolCall
  | ServerUpdateMessageContent
  | ServerUpdateMessageToolCall
  | ServerBeginNewAIMessagePart;

export type ServerSideUpdate = ServerSyncConversation | ServerSideConversationUpdate;

export type AgentUpdateMessage =
  | {
      side: 'server';
      update: ServerSideUpdate;
    }
  | {
      side: 'client';
      update: ClientSideUpdate;
    };
