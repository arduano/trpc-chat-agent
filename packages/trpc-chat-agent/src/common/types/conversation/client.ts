import type { AgentTools, ChatAgentOrTools } from '../../../common/agentTypes';
import type { AnyStructuredChatTool } from '../../../common/structuredTool';
import type { AdvancedAIMessageDataClientSide } from '../message/ai';
import type { AdvancedToolCallFromToolsArray } from '../tools';
import type {
  ClientBeginNewAIMessagePart,
  ClientSideConversationUpdate,
  ClientUpdateMessageBeginToolCall,
  ClientUpdateMessageContent,
  ClientUpdateMessageToolCall,
} from '../updates';
import type { ConversationData } from './conversation';
import { castDraft } from 'immer';
import { mergeKeepingOldReferences } from '../../../common/merge';
import { UnreachableError } from '../../../common/unreachable';
import { ChatConversation, concatMessageContent } from './conversation';

export type ClientSideConversationData<Tools extends readonly AnyStructuredChatTool[] = any> = ConversationData<
  AdvancedAIMessageDataClientSide<Tools>
>;

export class ClientSideChatConversation<Agent extends ChatAgentOrTools> extends ChatConversation<
  AdvancedAIMessageDataClientSide<AgentTools<Agent>>
> {
  constructor(data: ConversationData<AdvancedAIMessageDataClientSide<AgentTools<Agent>>>) {
    super(data);
  }

  public static makePlaceholderConversation<Agent extends ChatAgentOrTools>(): ClientSideChatConversation<Agent> {
    return new ClientSideChatConversation({
      aiMessageChildIds: {},
      humanMessageChildIds: {},
      humanMessages: {},
      aiMessages: {},
      id: '',
      messageIdCounter: 0,
    });
  }

  public mergeInNewData(data: ConversationData<AdvancedAIMessageDataClientSide<AgentTools<Agent>>>) {
    this.data = mergeKeepingOldReferences(this.data, data);
  }

  public processMessageUpdate(update: ClientSideConversationUpdate) {
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

  private updateMessageContent(update: ClientUpdateMessageContent) {
    this.produceAiMessage(update.messageId, (message) => {
      const lastPart = message.parts[message.parts.length - 1];
      lastPart.content = concatMessageContent(lastPart.content, update.contentToAppend);
    });
  }

  private updateMessageBeginToolCall(update: ClientUpdateMessageBeginToolCall) {
    this.produceAiMessage(update.messageId, (message) => {
      const lastPart = message.parts[message.parts.length - 1];
      const newToolCall = {
        id: update.toolCallId,
        state: 'loading',
        name: update.toolCallName,
      } as AdvancedToolCallFromToolsArray<AgentTools<Agent>>;

      lastPart.toolCalls.push(castDraft(newToolCall));
    });
  }

  private updateMessageToolCall(update: ClientUpdateMessageToolCall) {
    this.produceAiMessage(update.messageId, (message) => {
      const lastPart = message.parts[message.parts.length - 1];
      const toolCallIndex = lastPart.toolCalls.findIndex((tc) => tc.id === update.toolCallId);
      if (toolCallIndex === -1) {
        throw new Error(`Tool call with ID ${update.toolCallId} not found`);
      }

      const toolCall = lastPart.toolCalls[toolCallIndex];
      if (update.newArgs !== undefined) {
        toolCall.args = update.newArgs;
      }
      if (update.newProgressStatus !== undefined) {
        toolCall.progressStatus = update.newProgressStatus;
      }
      if (update.newResult !== undefined) {
        toolCall.result = update.newResult;
      }
      if (update.newState !== undefined) {
        toolCall.state = update.newState;
      }
    });
  }

  private beginNewAIMessagePart(update: ClientBeginNewAIMessagePart) {
    this.produceAiMessage(update.messageId, (message) => {
      message.parts.push({
        content: '',
        toolCalls: [],
      });
    });
  }
}
