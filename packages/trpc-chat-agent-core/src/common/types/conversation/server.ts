import type { AgentTools, AnyChatAgent } from '../../agentTypes';
import type { AnyStructuredChatTool } from '../../structuredTool';
import type { AIMessageData } from '../message/ai';
import type { ToolCallFromToolsArray } from '../tools';
import type {
  ServerBeginNewAIMessagePart,
  ServerSideConversationUpdate,
  ServerUpdateBeginToolCall,
  ServerUpdateMessageContent,
  ServerUpdateMessageToolCall,
} from '../updates';
import type { ClientSideConversation } from './client';
import type { ConversationData } from './conversation';
import { castDraft } from 'immer';
import { UnreachableError } from '../../unreachable';
import { ChatAIMessageWrapper } from '../message/ai';
import { ChatConversationHelper } from './conversation';

export type ServerSideConversation<Tools extends readonly AnyStructuredChatTool[] = any> = ConversationData<
  AIMessageData<Tools>
>;

export class ServerSideChatConversationHelper<Agent extends AnyChatAgent> extends ChatConversationHelper<
  AIMessageData<AgentTools<Agent>>
> {
  constructor(data: Readonly<ServerSideConversation<AgentTools<Agent>>>) {
    super(data);
  }

  public static newConversationData<Agent extends AnyChatAgent>(id: string): ServerSideConversation<AgentTools<Agent>> {
    return {
      id,
      messageIdCounter: 0,
      aiMessages: {},
      userMessages: {},
      aiMessageChildIds: {},
      userMessageChildIds: {},
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    };
  }

  public processMessageUpdate(update: ServerSideConversationUpdate) {
    switch (update.kind) {
      case 'update-content':
        return this.updateMessageContent(update);
      case 'begin-tool-call':
        return this.updateMessageBeginToolCall(update);
      case 'update-tool-call':
        return this.updateMessageToolCall(update);
      case 'begin-new-ai-message-part':
        return this.beginNewAIMessagePart(update);
      default:
        throw new UnreachableError(update, `Invalid update kind "${(update as any).kind}"`);
    }
  }

  public abortAllPendingToolCalls() {
    this.produceData((data) => {
      for (const aiMessage of Object.values(data.aiMessages)) {
        for (const part of aiMessage.parts) {
          for (const toolCall of part.toolCalls) {
            if (toolCall.state === 'loading') {
              toolCall.state = 'aborted';
            }
          }
        }
      }
    });
  }

  private updateMessageContent(update: ServerUpdateMessageContent) {
    this.produceAiMessage(update.messageId, (message) => {
      const lastPart = message.parts[message.parts.length - 1];
      lastPart.content = update.totalContent;
    });
  }

  private updateMessageBeginToolCall(update: ServerUpdateBeginToolCall) {
    this.produceAiMessage(update.messageId, (message) => {
      const lastPart = message.parts[message.parts.length - 1];
      const newToolCall = {
        id: update.toolCallId,
        name: update.toolCallName,
        args: update.newArgs,
        state: 'loading',
        client: {
          args: update.newClientArgs,
        },
      } as ToolCallFromToolsArray<AgentTools<Agent>>;

      lastPart.toolCalls.push(castDraft(newToolCall));
    });
  }

  private updateMessageToolCall(update: ServerUpdateMessageToolCall) {
    this.produceAiMessage(update.messageId, (message) => {
      const lastPart = message.parts[message.parts.length - 1];
      const toolCall = lastPart.toolCalls.find((tc) => tc.id === update.toolCallId);
      if (!toolCall) {
        throw new Error(`Tool call with ID ${update.toolCallId} not found`);
      }

      if (update.newResult !== undefined) {
        toolCall.result = update.newResult;
      }
      if (update.newClientArgs !== undefined) {
        toolCall.client.args = update.newClientArgs;
      }
      if (update.newClientResult !== undefined) {
        toolCall.client.result = update.newClientResult;
      }
      if (update.newState !== undefined) {
        toolCall.state = update.newState;
      }
    });
  }

  private beginNewAIMessagePart(update: ServerBeginNewAIMessagePart) {
    this.produceAiMessage(update.messageId, (message) => {
      message.parts.push({
        content: '',
        toolCalls: [],
        createdAt: new Date().toISOString(),
      });
    });
  }

  public asClientSideConversation(): ClientSideConversation<AgentTools<Agent>> {
    return {
      ...this.data,
      aiMessages: Object.fromEntries(
        Object.entries(this.data.aiMessages).map(([id, aiMessage]) => [
          id,
          new ChatAIMessageWrapper(aiMessage).asClientSideMessageData(),
        ])
      ),
    };
  }
}
