import type { MessageContentSpecialTextPart, UserMessageContent } from '../messageContent';
import type { ChatTreePath } from './branching';
import type { ClientSideConversation } from './conversation/client';
import type { ToolCallState } from './tools';

export type UpdateMessageContent = {
  kind: 'update-content';
  conversationId: string;
  messageId: string;
  partId: string;
  contentToAppend: string;
};

export type UpdateMessageSpecialContent = {
  kind: 'update-special-content';
  conversationId: string;
  messageId: string;
  partId: string;
  contentToAppend: string;
  specialType: MessageContentSpecialTextPart['specialType'];
};

export type CommonConversationUpdate = UpdateMessageContent | UpdateMessageSpecialContent;

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

export type ClientSyncConversation = {
  kind: 'sync-conversation';
  conversationId: string;
  conversationData: ClientSideConversation<any>;
  path: ChatTreePath;
};

export type ClientRequestCallbackResponse = {
  kind: 'request-callback-response';
  conversationId: string;
  messageId: string;
  toolCallId: string;
  callbackId: string;
  toolName: string;
  callbackName: string;
  requestArgs: {}; // Can't use "any" because of trpc issues
};

export type ClientSideConversationUpdate =
  | CommonConversationUpdate
  | ClientUpdateMessageBeginToolCall
  | ClientUpdateMessageToolCall;

export type ClientSideUpdate = ClientSyncConversation | ClientRequestCallbackResponse | ClientSideConversationUpdate;

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
  newResult?: UserMessageContent[];
  newClientArgs?: any;
  newClientResult?: any;
  newState?: ToolCallState;
};

export type ServerSideConversationUpdate =
  | CommonConversationUpdate
  | ServerUpdateBeginToolCall
  | ServerUpdateMessageToolCall;

export type ServerSideUpdate = ServerSideConversationUpdate;

export type AgentUpdateMessage =
  | {
      side: 'server';
      update: ServerSideUpdate;
    }
  | {
      side: 'client';
      update: ClientSideUpdate;
    };
