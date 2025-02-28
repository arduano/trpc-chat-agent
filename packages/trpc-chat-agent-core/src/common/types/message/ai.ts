import type { BaseMessage, UsageMetadata } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import type { MessageContent, MessageContentText } from '../../messageContent';
import type { AnyStructuredChatTool } from '../../structuredTool';
import type { ToolCallClientSideFromToolsArray, ToolCallFromToolsArray } from '../tools';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { processMessageContentForClient } from '../../messageContent';

export type AIMessagePartData<Tools extends readonly AnyStructuredChatTool[]> = {
  content: MessageContent;
  toolCalls: ToolCallFromToolsArray<Tools>[];
  responseMetadata?: Record<string, any>;
  usageMetadata?: UsageMetadata;
  createdAt: string;
};

export type AIMessageData<Tools extends readonly AnyStructuredChatTool[]> = {
  kind: 'ai';
  id: string;
  parts: AIMessagePartData<Tools>[];
  createdAt: string;
};

export class ChatAIMessageWrapper<Tools extends readonly AnyStructuredChatTool[]> {
  constructor(readonly data: AIMessageData<Tools>) {}

  public get id() {
    return this.data.id;
  }

  public get kind() {
    return this.data.kind;
  }

  public get lastPart() {
    return this.data.parts[this.data.parts.length - 1];
  }

  public get lastPartContent() {
    return this.lastPart.content;
  }

  // Makes sure that the content returned is always a string.
  // When non-string content is present, it will be replaced with '\n\n'
  public get lastPartContentString(): string {
    const content = this.lastPartContent;
    if (typeof content === 'string') {
      return content;
    } else {
      return content
        .filter((c): c is MessageContentText => c.type === 'text')
        .map((c) => c.text)
        .join('\n\n');
    }
  }

  public updateLastPartToolCall(toolCall: ToolCallFromToolsArray<Tools>) {
    const lastPart = this.lastPart;
    const index = lastPart.toolCalls.findIndex((tc) => tc.id === toolCall.id);
    if (index === -1) {
      lastPart.toolCalls.push(toolCall);
    } else {
      lastPart.toolCalls[index] = toolCall;
    }
  }

  public asLangChainMessages(): BaseMessage[] {
    function partHasContentOrToolCalls(part: AIMessagePartData<Tools>): boolean {
      return part.content.length > 0 || part.toolCalls.length > 0;
    }

    function partAsLangchainMessages(part: AIMessagePartData<Tools>): BaseMessage[] {
      const aiMessage = new AIMessage({
        content: part.content,
        tool_calls: part.toolCalls.map<ToolCall>((tc) => ({
          name: tc.name,
          args: tc.args,
          id: tc.id,
          type: 'tool_call',
        })),
        response_metadata: part.responseMetadata,
        usage_metadata: part.usageMetadata,
      });

      const toolResponseMessages = part.toolCalls.map<ToolMessage>(
        (tc) =>
          new ToolMessage({
            content: tc.result ?? 'Tool execution cancelled before completion.',
            tool_call_id: tc.id,
          })
      );

      return [aiMessage, ...toolResponseMessages];
    }

    return this.data.parts.filter(partHasContentOrToolCalls).flatMap(partAsLangchainMessages);
  }

  public asClientSideMessageData(): AIMessageDataClientSide<Tools> {
    return {
      id: this.data.id,
      kind: this.data.kind,
      parts: this.data.parts.map<AIMessageDataPartClientSide<Tools>>((part) => ({
        content: processMessageContentForClient(part.content),
        toolCalls: part.toolCalls.map<ToolCallClientSideFromToolsArray<Tools>>((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.client.args,
          result: tc.client.result,
          state: tc.state,
        })),
        createdAt: part.createdAt,
      })),
      createdAt: this.data.createdAt,
    };
  }
}

export type AIMessageDataPartClientSide<Tools extends readonly AnyStructuredChatTool[]> = {
  content: MessageContent;
  toolCalls: ToolCallClientSideFromToolsArray<Tools>[];
  createdAt: string;
};

export type AIMessageDataClientSide<Tools extends readonly AnyStructuredChatTool[]> = {
  kind: 'ai';
  id: string;
  parts: AIMessageDataPartClientSide<Tools>[];
  createdAt: string;
};
