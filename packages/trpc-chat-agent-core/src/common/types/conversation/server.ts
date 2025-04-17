import type { AgentTools, AnyChatAgent } from '../../agentTypes';
import type { AnyStructuredChatTool } from '../../structuredTool';
import type { AIMessageData } from '../message/ai';
import type { ToolCallFromToolsArray } from '../tools';
import type {
  ServerSideConversationUpdate,
  ServerUpdateBeginToolCall,
  ServerUpdateMessageToolCall,
  UpdateMessageContent,
  UpdateMessageSpecialContent,
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
      case 'update-special-content':
        return this.updateMessageSpecialContent(update);
      case 'begin-tool-call':
        return this.updateMessageBeginToolCall(update);
      case 'update-tool-call':
        return this.updateMessageToolCall(update);
      default:
        throw new UnreachableError(update, `Invalid update kind "${(update as any).kind}"`);
    }
  }

  public abortAllPendingToolCalls() {
    this.produceData((data) => {
      for (const aiMessage of Object.values(data.aiMessages)) {
        for (const part of aiMessage.parts) {
          if (part.type === 'tool') {
            if (part.data.state === 'loading') {
              part.data.state = 'aborted';
            }
          }
        }
      }
    });
  }

  private updateMessageContent(update: UpdateMessageContent) {
    this.produceAiMessage(update.messageId, (message) => {
      const partWithId = message.parts.find((part) => part.type === 'text' && part.id === update.partId);
      if (!partWithId) {
        message.parts.push({
          type: 'text',
          id: update.partId,
          text: update.contentToAppend,
        });
      } else if (partWithId.type === 'text') {
        partWithId.text += update.contentToAppend;
      }
    });
  }

  private updateMessageSpecialContent(update: UpdateMessageSpecialContent) {
    this.produceAiMessage(update.messageId, (message) => {
      const partWithId = message.parts.find((part) => part.type === 'special-text' && part.id === update.partId);
      if (!partWithId) {
        message.parts.push({
          type: 'special-text',
          id: update.partId,
          specialType: update.specialType,
          text: update.contentToAppend,
        });
      } else if (partWithId.type === 'special-text') {
        partWithId.text += update.contentToAppend;
      }
    });
  }

  private updateMessageBeginToolCall(update: ServerUpdateBeginToolCall) {
    this.produceAiMessage(update.messageId, (message) => {
      const newToolCall: ToolCallFromToolsArray<AgentTools<Agent>> = {
        id: update.toolCallId,
        name: update.toolCallName,
        args: update.newArgs,
        state: 'loading',
        client: {
          args: update.newClientArgs,
        },
      };

      message.parts.push(
        castDraft({
          type: 'tool',
          id: update.toolCallId,
          data: newToolCall,
        })
      );
    });
  }

  private updateMessageToolCall(update: ServerUpdateMessageToolCall) {
    this.produceAiMessage(update.messageId, (message) => {
      const toolCall = message.parts.find((part) => part.type === 'tool' && part.data.id === update.toolCallId);
      if (!toolCall || toolCall.type !== 'tool') {
        throw new Error(`Tool call with ID ${update.toolCallId} not found`);
      }

      if (update.newResult !== undefined) {
        toolCall.data.result = update.newResult;
      }
      if (update.newClientArgs !== undefined) {
        toolCall.data.client.args = update.newClientArgs;
      }
      if (update.newClientResult !== undefined) {
        toolCall.data.client.result = update.newClientResult;
      }
      if (update.newState !== undefined) {
        toolCall.data.state = update.newState;
      }
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
