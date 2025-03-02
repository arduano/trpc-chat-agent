import type { MessageContent, MessageContentText } from '../../messageContent';
import type { AnyStructuredChatTool } from '../../structuredTool';
import type { ToolCallClientSideFromToolsArray, ToolCallFromToolsArray } from '../tools';
import { processMessageContentForClient } from '../../messageContent';

export type AIMessagePartData<Tools extends readonly AnyStructuredChatTool[]> = {
  content: MessageContent;
  toolCalls: ToolCallFromToolsArray<Tools>[];
  responseMetadata?: Record<string, any>;
  usageMetadata?: Record<string, any>;
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
