import type { BaseMessage, MessageContent, MessageContentText, UsageMetadata } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import type { Draft, WritableDraft } from 'immer';
import type { AdvancedReactAgent } from '../server/advancedReactAgent';
import type { AnyStructuredChatTool } from '../server/tool';
import type { AgentTools } from './agentTypes';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { castDraft, produce } from 'immer';
import { z } from 'zod';
import { UnreachableError } from './unreachable';

export type ToolCallState = 'loading' | 'complete' | 'aborted';

export type AdvancedToolCall<Tool extends AnyStructuredChatTool> = {
  id: string;
  name: Tool['TypeInfo']['Name'];
  args: Tool['TypeInfo']['Args'];
  // May or may not be present. Generally present when the tool finishes executing. Will be missing if execution was cancelled before completion.
  result?: MessageContent;
  state: ToolCallState;
  client: {
    args: Tool['TypeInfo']['ArgsForClient'];
    // May or may not be present. Generally present when the tool finishes executing. Will be missing if execution was cancelled before completion.
    result?: Tool['TypeInfo']['ResultForClient'];
  };
};

export type AdvancedToolCallFromToolsArray<Tools extends readonly AnyStructuredChatTool[]> = {
  [K in keyof Tools]: AdvancedToolCall<Tools[K]>;
}[number];

export type AdvancedToolCallClientSide<Tool extends AnyStructuredChatTool> = {
  id: string;

  name: string extends Tool['TypeInfo']['Name'] ? string : Tool['TypeInfo']['Name']; // This hack is necessary because of some complex edge cases around the `any` type

  // May or may not be present. The name is known first, then the preview args get sent along after
  args?: Tool['TypeInfo']['ArgsForClient'];
  // May or may not be present. May be sent along when the tool is being executed. Does not persist.
  progressStatus?: Tool['TypeInfo']['ToolProgress'];
  // May or may not be present. Generally present when the tool finishes executing.
  result?: Tool['TypeInfo']['ResultForClient'];
  state: ToolCallState;
};

export type AdvancedToolCallClientSideFromToolsArray<Tools extends readonly AnyStructuredChatTool[]> = {
  [K in keyof Tools]: AdvancedToolCallClientSide<Tools[K]>;
}[number];

export type AdvancedAIMessagePartData<Tools extends readonly AnyStructuredChatTool[]> = {
  content: MessageContent;
  toolCalls: AdvancedToolCallFromToolsArray<Tools>[];
  responseMetadata?: Record<string, any>;
  usageMetadata?: UsageMetadata;
};

export type AdvancedAIMessageData<Tools extends readonly AnyStructuredChatTool[]> = {
  kind: 'ai';
  id: string;
  parts: AdvancedAIMessagePartData<Tools>[];
};

export class ChatAdvancedAIMessage<Tools extends readonly AnyStructuredChatTool[]> {
  constructor(readonly data: AdvancedAIMessageData<Tools>) {}

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

  public updateLastPartToolCall(toolCall: AdvancedToolCallFromToolsArray<Tools>) {
    const lastPart = this.lastPart;
    const index = lastPart.toolCalls.findIndex((tc) => tc.id === toolCall.id);
    if (index === -1) {
      lastPart.toolCalls.push(toolCall);
    } else {
      lastPart.toolCalls[index] = toolCall;
    }
  }

  public asLangChainMessages(): BaseMessage[] {
    function partAsLangchainMessages(part: AdvancedAIMessagePartData<Tools>): BaseMessage[] {
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

    return this.data.parts.flatMap(partAsLangchainMessages);
  }

  public asClientSideMessageData(): AdvancedAIMessageDataClientSide<Tools> {
    return {
      id: this.data.id,
      kind: this.data.kind,
      parts: this.data.parts.map<AdvancedAIMessageDataPartClientSide<Tools>>((part) => ({
        content: part.content,
        toolCalls: part.toolCalls.map<AdvancedToolCallClientSideFromToolsArray<Tools>>((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.client.args,
          result: tc.client.result,
          state: tc.state,
        })),
      })),
    };
  }
}

export type AdvancedAIMessageDataPartClientSide<Tools extends readonly AnyStructuredChatTool[]> = {
  content: MessageContent;
  toolCalls: AdvancedToolCallClientSideFromToolsArray<Tools>[];
};

export type AdvancedAIMessageDataClientSide<Tools extends readonly AnyStructuredChatTool[]> = {
  kind: 'ai';
  id: string;
  parts: AdvancedAIMessageDataPartClientSide<Tools>[];
};

export type HumanMessageData = {
  kind: 'human';
  id: string;
  content: MessageContent;
};

export class ChatHumanMessage {
  constructor(readonly data: HumanMessageData) {}

  public get id() {
    return this.data.id;
  }

  public get kind() {
    return this.data.kind;
  }

  public get content() {
    return this.data.content;
  }

  // Makes sure that the content returned is always a string.
  // When non-string content is present, it will be replaced with '\n\n'
  public get contentString(): string {
    if (typeof this.data.content === 'string') {
      return this.data.content;
    }
    return this.data.content
      .map((content) => {
        if ('text' in content) {
          return content.text;
        }
        return '\n\n';
      })
      .join('');
  }

  public asLangChainMessage(): BaseMessage {
    return new HumanMessage({
      content: this.content,
    });
  }
}

export type ConversationData<AIMessage> = {
  id: string;

  messageIdCounter: number;

  aiMessages: Record<string, AIMessage>;
  humanMessages: Record<string, HumanMessageData>;

  aiMessageChildIds: Record<string, string[]>;
  humanMessageChildIds: Record<string, string[]>;
};

export type ServerSideConversationData<Tools extends readonly AnyStructuredChatTool[]> = ConversationData<
  AdvancedAIMessageData<Tools>
>;

export type ClientSideConversationData<Tools extends readonly AnyStructuredChatTool[]> = ConversationData<
  AdvancedAIMessageDataClientSide<Tools>
>;

export const chatBranchZod = z.array(
  z.object({
    humanMessageIndex: z.number(),
    aiMessageIndex: z.number(),
  })
);
export type ChatTree = z.infer<typeof chatBranchZod>;

export class ChatConversation<AIMessage extends { id: string }> {
  data: ConversationData<AIMessage>;

  constructor(data: ConversationData<AIMessage>) {
    this.data = data;
  }

  readonly aiMessageRootId = '_root_';

  protected produceData(fn: (data: WritableDraft<ConversationData<AIMessage>>) => void) {
    this.data = produce(this.data, fn);
  }

  protected produceAiMessage(messageId: string, fn: (data: Draft<AIMessage>) => void) {
    this.data = produce(this.data, (data) => {
      const aiMessage = data.aiMessages[messageId];
      if (!aiMessage) {
        throw new Error('Invalid messageId');
      }
      fn(aiMessage);
    });
  }

  public generateId() {
    this.produceData((data) => {
      data.messageIdCounter += 1;
    });
    return this.data.messageIdCounter.toString();
  }

  public getMessageIdPairAt(tree: ChatTree) {
    if (tree.length === 0) {
      return {
        human: null,
        ai: this.aiMessageRootId,
      };
    }

    let humanId = '';
    let aiId = this.aiMessageRootId;

    for (const selection of tree) {
      const nextHumanId = this.data.aiMessageChildIds?.[aiId]?.[selection.humanMessageIndex];
      if (!nextHumanId) {
        return null;
      }
      humanId = nextHumanId;
      const nextAiId = this.data.humanMessageChildIds?.[humanId]?.[selection.aiMessageIndex];
      if (!nextAiId) {
        return null;
      }
      aiId = nextAiId;
    }

    return {
      human: humanId,
      ai: aiId,
    };
  }

  public getDefaultTree(): ChatTree {
    const tree: ChatTree = [];

    let humanId = '';
    let aiId = this.aiMessageRootId;

    while (true) {
      const humanList = this.data.aiMessageChildIds?.[aiId];
      if (!humanList) {
        break;
      }
      const humanIndex = humanList.length - 1;
      if (humanIndex === -1) {
        throw new Error('Invalid tree');
      }
      humanId = humanList[humanIndex];

      const aiList = this.data.humanMessageChildIds?.[humanId];
      if (!aiList) {
        throw new Error('Invalid tree');
      }
      const aiIndex = aiList.length - 1;
      if (aiIndex === -1) {
        throw new Error('Invalid tree');
      }
      aiId = aiList[aiIndex];

      tree.push({
        humanMessageIndex: humanIndex,
        aiMessageIndex: aiIndex,
      });
    }

    return tree;
  }

  public getHumanMessageIdAt(tree: ChatTree) {
    const pair = this.getMessageIdPairAt(tree);
    if (!pair) {
      return null;
    }
    return pair.human;
  }

  public getAIMessageIdAt(tree: ChatTree) {
    const pair = this.getMessageIdPairAt(tree);
    if (!pair) {
      return null;
    }
    return pair.ai;
  }

  public getAIMessageAt(tree: ChatTree) {
    const aiId = this.getAIMessageIdAt(tree);
    if (!aiId) {
      return null;
    }
    return this.data.aiMessages?.[aiId];
  }

  private pushNewIndexforHumanMessageChildren(humanId: string, childAiId: string) {
    let newIndex = 0;
    this.produceData((data) => {
      if (!data.humanMessageChildIds?.[humanId]) {
        data.humanMessageChildIds[humanId] = [];
      }
      const array = data.humanMessageChildIds[humanId];
      newIndex = array.length;
      array.push(childAiId);
    });

    return newIndex;
  }

  private pushNewIndexforAIMessageChildren(aiId: string, childHumanId: string) {
    let newIndex = 0;
    this.produceData((data) => {
      if (!data.aiMessageChildIds?.[aiId]) {
        data.aiMessageChildIds[aiId] = [];
      }
      const array = data.aiMessageChildIds[aiId];
      newIndex = array.length;
      array.push(childHumanId);
    });

    return newIndex;
  }

  public pushHumanAiMessagePair(tree: ChatTree, humanMessage: HumanMessageData, aiMessage: AIMessage): ChatTree {
    if (this.data.humanMessages[humanMessage.id]) {
      throw new Error('Human message already exists');
    }
    if (this.data.aiMessages[aiMessage.id]) {
      throw new Error('AI message already exists');
    }

    const parentAiId = this.getAIMessageIdAt(tree);
    if (!parentAiId) {
      throw new Error('Invalid tree');
    }

    const humanId = humanMessage.id;
    const aiId = aiMessage.id;

    const newHumanIndex = this.pushNewIndexforAIMessageChildren(parentAiId, humanId);
    const newAiIndex = this.pushNewIndexforHumanMessageChildren(humanId, aiId);

    this.produceData((data) => {
      data.humanMessages[humanId] = humanMessage;
      data.aiMessages[aiId] = castDraft(aiMessage);
    });

    return [
      ...tree,
      {
        humanMessageIndex: newHumanIndex,
        aiMessageIndex: newAiIndex,
      },
    ];
  }

  public asMessagesArray(tree: ChatTree): (HumanMessageData | AIMessage)[] {
    const messages: (HumanMessageData | AIMessage)[] = [];

    if (tree.length === 0) {
      return messages;
    }

    let humanId = '';
    let aiId = this.aiMessageRootId;

    for (const selection of tree) {
      const nextHumanId = this.data.aiMessageChildIds[aiId]?.[selection.humanMessageIndex];
      if (!nextHumanId) {
        throw new Error('Invalid tree');
      }
      humanId = nextHumanId;
      const nextAiId = this.data.humanMessageChildIds[humanId]?.[selection.aiMessageIndex];
      if (!nextAiId) {
        throw new Error('Invalid tree');
      }
      aiId = nextAiId;

      messages.push(this.data.humanMessages[humanId]);
      messages.push(this.data.aiMessages[aiId]);
    }

    return messages;
  }
}

export class ServerSideChatConversation<Agent extends AdvancedReactAgent<any>> extends ChatConversation<
  AdvancedAIMessageData<AgentTools<Agent>>
> {
  constructor(data: ServerSideConversationData<AgentTools<Agent>>) {
    super(data);
  }

  public static newConversationData<Agent extends AdvancedReactAgent<any>>(
    id: string
  ): ServerSideConversationData<AgentTools<Agent>> {
    return {
      id,
      messageIdCounter: 0,
      aiMessages: {},
      humanMessages: {},
      aiMessageChildIds: {},
      humanMessageChildIds: {},
    };
  }

  public asLangChainMessagesArray(tree: ChatTree): BaseMessage[] {
    return this.asMessagesArray(tree).flatMap((message) => {
      switch (message.kind) {
        case 'ai':
          return new ChatAdvancedAIMessage<AgentTools<Agent>>(message).asLangChainMessages();
        case 'human':
          return [new ChatHumanMessage(message).asLangChainMessage()];
        default:
          throw new UnreachableError(message, `Invalid message kind "${(message as any).kind}"`);
      }
    });
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
      lastPart.content = concatMessageContent(lastPart.content, update.contentToAppend);
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
      } as AdvancedToolCallFromToolsArray<AgentTools<Agent>>;

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
      });
    });
  }

  public asClientSideConversation(): ClientSideConversationData<AgentTools<Agent>> {
    return {
      ...this.data,
      aiMessages: Object.fromEntries(
        Object.entries(this.data.aiMessages).map(([id, aiMessage]) => [
          id,
          new ChatAdvancedAIMessage(aiMessage).asClientSideMessageData(),
        ])
      ),
    };
  }
}

export class ClientSideChatConversation<Agent extends AdvancedReactAgent<any>> extends ChatConversation<
  AdvancedAIMessageDataClientSide<AgentTools<Agent>>
> {
  constructor(data: ConversationData<AdvancedAIMessageDataClientSide<AgentTools<Agent>>>) {
    super(data);
  }

  public static makePlaceholderConversation<Agent extends AdvancedReactAgent>(): ClientSideChatConversation<Agent> {
    return new ClientSideChatConversation({
      aiMessageChildIds: {},
      humanMessageChildIds: {},
      humanMessages: {},
      aiMessages: {},
      id: '',
      messageIdCounter: 0,
    });
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
  contentToAppend: MessageContent;
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

function concatMessageContent(messageContent: MessageContent, contentToAppend: MessageContent): MessageContent {
  // Handle mismatches between string and non-string content
  if (typeof contentToAppend === 'string') {
    if (typeof messageContent === 'string') {
      return messageContent + contentToAppend;
    } else {
      return [
        ...messageContent,
        {
          type: 'text',
          text: contentToAppend,
        },
      ];
    }
  } else {
    if (typeof messageContent === 'string') {
      return [
        {
          type: 'text',
          text: messageContent,
        },
        ...contentToAppend,
      ];
    } else {
      return messageContent.concat(contentToAppend);
    }
  }
}
