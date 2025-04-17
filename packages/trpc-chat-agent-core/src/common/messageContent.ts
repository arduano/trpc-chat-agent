/*
 * Message content types copied from LangChain
 */

import type { AnyStructuredChatTool } from './structuredTool';
import type { ToolCallClientSideFromToolsArray, ToolCallFromToolsArray } from './types';

export type UserMessageContentTextPart = {
  type: 'text';
  text: string;
};

export type MessageContentTextPart = UserMessageContentTextPart & {
  id: string;
};

export type MessageContentSpecialTextPart = {
  type: 'special-text';
  id: string;
  text: string;
  specialType: 'thinking';
};

export type MessageContentToolPart<Tools extends readonly AnyStructuredChatTool[]> = MessageContentCustomToolCallType<
  ToolCallFromToolsArray<Tools>
>;

export type MessageContentToolPartClientSide<Tools extends readonly AnyStructuredChatTool[]> =
  MessageContentCustomToolCallType<ToolCallClientSideFromToolsArray<Tools>>;

export type AiMessageContent<Tools extends readonly AnyStructuredChatTool[]> = AiMessageContentForCustomToolCallType<
  ToolCallFromToolsArray<Tools>
>;

export type AiMessageContentClientSide<Tools extends readonly AnyStructuredChatTool[]> =
  AiMessageContentForCustomToolCallType<ToolCallClientSideFromToolsArray<Tools>>;

// Custom types for generics
export type AiMessageContentForCustomToolCallType<ToolCallType> =
  | MessageContentTextPart
  | MessageContentSpecialTextPart
  | MessageContentCustomToolCallType<ToolCallType>;

export type MessageContentCustomToolCallType<ToolCallType> = {
  type: 'tool';
  id: string;
  data: ToolCallType;
};

// User
export type UserMessageContent = UserMessageContentTextPart;

export function userContentToText(content: UserMessageContent[]): string {
  return content.map((part) => part.text).join('');
}
