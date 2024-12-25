import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  MessageContentComplex,
  MessageContentText,
  ToolMessage,
  UsageMetadata,
} from "@langchain/core/messages";
import { AnyStructuredChatTool } from "./tool";
import { ToolCall } from "@langchain/core/messages/tool";
import { UnreachableError } from "./unreachable";

export type AdvancedToolCall<Tool extends AnyStructuredChatTool> = {
  id: string;
  name: Tool["TypeInfo"]["Name"];
  args: Tool["TypeInfo"]["Args"];
  result: Tool["TypeInfo"]["Return"];
  client: {
    args: Tool["TypeInfo"]["ArgsForClient"];
    result: Tool["TypeInfo"]["ResultForClient"];
  };
};

export type AdvancedToolCallFromToolsArray<
  Tools extends readonly AnyStructuredChatTool[]
> = {
  [K in keyof Tools]: AdvancedToolCall<Tools[K]>;
}[number];

export type AdvancedToolCallClientSide<Tool extends AnyStructuredChatTool> = {
  id: string;
  name: Tool["TypeInfo"]["Name"];
  args: Tool["TypeInfo"]["ArgsForClient"];
  result: Tool["TypeInfo"]["ResultForClient"];
};

export type AdvancedToolCallClientSideFromToolsArray<
  Tools extends readonly AnyStructuredChatTool[]
> = {
  [K in keyof Tools]: AdvancedToolCallClientSide<Tools[K]>;
}[number];

export type AdvancedAIMessageData<
  Tools extends readonly AnyStructuredChatTool[]
> = {
  kind: "ai";
  id: string;
  content: string | MessageContentComplex[];
  toolCalls: AdvancedToolCallFromToolsArray<Tools>[];
  responseMetadata?: Record<string, any>;
  usageMetadata?: UsageMetadata;
};

export class ChatAdvancedAIMessage<
  Tools extends readonly AnyStructuredChatTool[]
> {
  constructor(readonly data: AdvancedAIMessageData<Tools>) {}

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
    if (typeof this.data.content === "string") {
      return this.data.content;
    } else {
      return this.data.content
        .filter((c): c is MessageContentText => c.type === "text")
        .map((c) => c.text)
        .join("\n\n");
    }
  }

  public set content(content: string | MessageContentComplex[]) {
    this.data.content = content;
  }

  public get toolCalls() {
    return this.data.toolCalls;
  }

  public getToolCallById(id: string) {
    return this.data.toolCalls.find((tc) => tc.id === id);
  }

  public addToolCall(toolCall: AdvancedToolCallFromToolsArray<Tools>) {
    this.data.toolCalls.push(toolCall);
  }

  public updateToolCall(toolCall: AdvancedToolCallFromToolsArray<Tools>) {
    const index = this.data.toolCalls.findIndex((tc) => tc.id === toolCall.id);
    if (index === -1) {
      this.data.toolCalls.push(toolCall);
    } else {
      this.data.toolCalls[index] = toolCall;
    }
  }

  public asLangChainMessages(): BaseMessage[] {
    const aiMessage = new AIMessage({
      content: this.content,
      tool_calls: this.toolCalls.map<ToolCall>((tc) => ({
        name: tc.name,
        args: tc.args,
        id: tc.id,
        type: "tool_call",
      })),
      response_metadata: this.data.responseMetadata,
      usage_metadata: this.data.usageMetadata,
    });

    const toolResponseMessages = this.toolCalls.map<ToolMessage>(
      (tc) =>
        new ToolMessage({
          content: tc.result,
          tool_call_id: tc.id,
        })
    );

    return [aiMessage, ...toolResponseMessages];
  }
}

export type AdvancedAIMessageDataClientSide<
  Tools extends readonly AnyStructuredChatTool[]
> = {
  kind: "ai";
  id: string;
  content: string | MessageContentComplex[];
  toolCalls: AdvancedToolCallClientSideFromToolsArray<Tools>[];
};

export class ChatAdvancedAIMessageClientSide<
  Tools extends readonly AnyStructuredChatTool[]
> {
  constructor(readonly data: AdvancedAIMessageDataClientSide<Tools>) {}

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
    if (typeof this.data.content === "string") {
      return this.data.content;
    }
    return this.data.content
      .map((content) => {
        if ("text" in content) {
          return content.text;
        }
        return "\n\n";
      })
      .join("");
  }

  public get toolCalls() {
    return this.data.toolCalls;
  }

  public getToolCallById(id: string) {
    return this.data.toolCalls.find((tc) => tc.id === id);
  }

  public addToolCall(
    toolCall: AdvancedToolCallClientSideFromToolsArray<Tools>
  ) {
    this.data.toolCalls.push(toolCall);
  }

  public updateToolCall(
    toolCall: AdvancedToolCallClientSideFromToolsArray<Tools>
  ) {
    const index = this.data.toolCalls.findIndex((tc) => tc.id === toolCall.id);
    if (index === -1) {
      this.data.toolCalls.push(toolCall);
    } else {
      this.data.toolCalls[index] = toolCall;
    }
  }
}

export type HumanMessageData = {
  kind: "human";
  id: string;
  content: string | MessageContentComplex[];
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
    if (typeof this.data.content === "string") {
      return this.data.content;
    }
    return this.data.content
      .map((content) => {
        if ("text" in content) {
          return content.text;
        }
        return "\n\n";
      })
      .join("");
  }

  public asLangChainMessage(): BaseMessage {
    return new HumanMessage({
      content: this.content,
    });
  }
}

export type ConversationData<AIMessage> = {
  idCounter: number;

  aiMessages: Record<string, AIMessage>;
  humanMessages: Record<string, HumanMessageData>;

  aiMessageChildIds: Record<string, string[]>;
  humanMessageChildIds: Record<string, string[]>;
};

export type ChatBranchSelection = {
  humanMessageIndex: number;
  aiMessageIndex: number;
};

export type ChatBranch = ChatBranchSelection[];

export class ChatConversation<AIMessage extends { id: string }> {
  constructor(readonly data: ConversationData<AIMessage>) {}

  readonly aiMessageRootId = "_root_";

  private generateId() {
    this.data.idCounter += 1;
    return this.data.idCounter.toString();
  }

  public getMessageIdPairAt(tree: ChatBranch) {
    if (tree.length === 0) {
      return {
        human: null,
        ai: this.aiMessageRootId,
      };
    }

    let humanId = "";
    let aiId = this.aiMessageRootId;

    for (const selection of tree) {
      const nextHumanId =
        this.data.aiMessageChildIds?.[aiId]?.[selection.humanMessageIndex];
      if (!nextHumanId) {
        return null;
      }
      humanId = nextHumanId;
      const nextAiId =
        this.data.humanMessageChildIds?.[humanId]?.[selection.aiMessageIndex];
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

  public getHumanMessageIdAt(tree: ChatBranch) {
    const pair = this.getMessageIdPairAt(tree);
    if (!pair) {
      return null;
    }
    return pair.human;
  }

  public getAIMessageIdAt(tree: ChatBranch) {
    const pair = this.getMessageIdPairAt(tree);
    if (!pair) {
      return null;
    }
    return pair.ai;
  }

  private pushNewIndexforHumanMessageChildren(
    humanId: string,
    childAiId: string
  ) {
    if (!this.data.humanMessageChildIds?.[humanId]) {
      this.data.humanMessageChildIds[humanId] = [];
    }
    const array = this.data.humanMessageChildIds[humanId];
    const newIndex = array.length;
    array.push(childAiId);
    return newIndex;
  }

  private pushNewIndexforAIMessageChildren(aiId: string, childHumanId: string) {
    if (!this.data.aiMessageChildIds?.[aiId]) {
      this.data.aiMessageChildIds[aiId] = [];
    }
    const array = this.data.aiMessageChildIds[aiId];
    const newIndex = array.length;
    array.push(childHumanId);
    return newIndex;
  }

  public pushHumanAiMessagePair(
    tree: ChatBranch,
    humanMessage: HumanMessageData,
    aiMessage: AIMessage
  ): ChatBranch {
    if (this.data.humanMessages[humanMessage.id]) {
      throw new Error("Human message already exists");
    }
    if (this.data.aiMessages[aiMessage.id]) {
      throw new Error("AI message already exists");
    }

    const parentAiId = this.getAIMessageIdAt(tree);
    if (!parentAiId) {
      throw new Error("Invalid tree");
    }

    const humanId = this.generateId();
    const aiId = this.generateId();

    const newHumanIndex = this.pushNewIndexforAIMessageChildren(
      parentAiId,
      humanId
    );
    const newAiIndex = this.pushNewIndexforHumanMessageChildren(humanId, aiId);

    this.data.humanMessages[humanId] = humanMessage;
    this.data.aiMessages[aiId] = aiMessage;

    return [
      ...tree,
      {
        humanMessageIndex: newHumanIndex,
        aiMessageIndex: newAiIndex,
      },
    ];
  }

  public asMessagesArray(tree: ChatBranch): (HumanMessageData | AIMessage)[] {
    const messages: (HumanMessageData | AIMessage)[] = [];

    for (const selection of tree) {
      const humanId = this.getHumanMessageIdAt(tree);
      const aiId = this.getAIMessageIdAt(tree);
      if (!humanId || !aiId) {
        throw new Error("Invalid tree");
      }
      const humanMessage = this.data.humanMessages?.[humanId];
      const aiMessage = this.data.aiMessages?.[aiId];
      if (!humanMessage || !aiMessage) {
        throw new Error("Invalid tree");
      }
      messages.push(humanMessage);
      messages.push(aiMessage);
    }

    return messages;
  }
}

export class ServerSideChatConversation<
  Tools extends readonly AnyStructuredChatTool[]
> extends ChatConversation<AdvancedAIMessageData<Tools>> {
  constructor(data: ConversationData<AdvancedAIMessageData<Tools>>) {
    super(data);
  }

  public asLangChainMessagesArray(tree: ChatBranch): BaseMessage[] {
    return this.asMessagesArray(tree).flatMap((message) => {
      switch (message.kind) {
        case "ai":
          return new ChatAdvancedAIMessage<Tools>(
            message
          ).asLangChainMessages();
        case "human":
          return [new ChatHumanMessage(message).asLangChainMessage()];
        default:
          throw new UnreachableError(
            message,
            `Invalid message kind "${(message as any).kind}"`
          );
      }
    });
  }
}

export class ClientSideChatConversation<
  Tools extends readonly AnyStructuredChatTool[]
> extends ChatConversation<AdvancedAIMessageDataClientSide<Tools>> {
  constructor(data: ConversationData<AdvancedAIMessageDataClientSide<Tools>>) {
    super(data);
  }
}
