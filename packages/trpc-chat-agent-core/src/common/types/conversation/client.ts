import type { AgentTools, ChatAgentOrTools } from '../../../common/agentTypes';
import type { AnyStructuredChatTool } from '../../../common/structuredTool';
import type { AIMessageDataClientSide } from '../message/ai';
import type { ToolCallClientSideFromToolsArray } from '../tools';
import type {
  ClientSideConversationUpdate,
  ClientUpdateMessageBeginToolCall,
  ClientUpdateMessageToolCall,
  UpdateMessageContent,
  UpdateMessageSpecialContent,
} from '../updates';
import type { ConversationData } from './conversation';
import { castDraft } from 'immer';
import { mergeKeepingOldReferences } from '../../../common/merge';
import { UnreachableError } from '../../../common/unreachable';
import { ChatConversationHelper } from './conversation';

export type ClientSideConversation<Tools extends readonly AnyStructuredChatTool[] = any> = ConversationData<
  AIMessageDataClientSide<Tools>
>;

export class ClientSideChatConversationHelper<Agent extends ChatAgentOrTools> extends ChatConversationHelper<
  AIMessageDataClientSide<AgentTools<Agent>>
> {
  constructor(data: ConversationData<AIMessageDataClientSide<AgentTools<Agent>>>) {
    super(data);
  }

  public static makePlaceholderConversation<Agent extends ChatAgentOrTools>(): ClientSideChatConversationHelper<Agent> {
    return new ClientSideChatConversationHelper({
      aiMessageChildIds: {},
      userMessageChildIds: {},
      userMessages: {},
      aiMessages: {},
      id: '',
      messageIdCounter: 0,
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    });
  }

  public mergeInNewData(data: ConversationData<AIMessageDataClientSide<AgentTools<Agent>>>) {
    this.data = mergeKeepingOldReferences(this.data, data);
  }

  public processMessageUpdate(update: ClientSideConversationUpdate) {
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

  private updateMessageBeginToolCall(update: ClientUpdateMessageBeginToolCall) {
    this.produceAiMessage(update.messageId, (message) => {
      const newToolCall: ToolCallClientSideFromToolsArray<AgentTools<Agent>> = {
        id: update.toolCallId,
        name: update.toolCallName,
        state: 'loading',
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

  private updateMessageToolCall(update: ClientUpdateMessageToolCall) {
    this.produceAiMessage(update.messageId, (message) => {
      const toolCall = message.parts.find((part) => part.type === 'tool' && part.data.id === update.toolCallId);
      if (!toolCall || toolCall.type !== 'tool') {
        throw new Error(`Tool call with ID ${update.toolCallId} not found`);
      }

      if (update.newArgs !== undefined) {
        toolCall.data.args = update.newArgs;
      }
      if (update.newProgressStatus !== undefined) {
        toolCall.data.progressStatus = update.newProgressStatus;
      }
      if (update.newResult !== undefined) {
        toolCall.data.result = update.newResult;
      }
      if (update.newState !== undefined) {
        toolCall.data.state = update.newState;
      }
    });
  }
}
