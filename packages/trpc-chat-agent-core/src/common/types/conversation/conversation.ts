import type { Draft, WritableDraft } from 'immer';
import type { MessageContent } from '../..';
import type { ChatBranchState, ChatTreePath } from '../branching';
import type { HumanMessageData } from '../message/human';
import { castDraft, produce } from 'immer';

export type ConversationData<AIMessage> = {
  id: string;

  messageIdCounter: number;

  aiMessages: Record<string, AIMessage>;
  humanMessages: Record<string, HumanMessageData>;

  aiMessageChildIds: Record<string, string[]>;
  humanMessageChildIds: Record<string, string[]>;
};

export class ChatConversation<AIMessage extends { id: string }> {
  data: ConversationData<AIMessage>;

  constructor(data: ConversationData<AIMessage>) {
    this.data = data;
  }

  static readonly aiMessageRootId = '_root_';

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

  public getMessageIdPairAt(tree: ChatTreePath) {
    if (tree.length === 0) {
      return {
        human: null,
        ai: ChatConversation.aiMessageRootId,
      };
    }

    let humanId = '';
    let aiId = ChatConversation.aiMessageRootId;

    for (const selection of tree) {
      const nextHumanId = this.data.aiMessageChildIds?.[aiId]?.[selection.aiMessageChildIndex];
      if (!nextHumanId) {
        return null;
      }
      humanId = nextHumanId;
      const nextAiId = this.data.humanMessageChildIds?.[humanId]?.[selection.humanMessageChildIndex];
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

  public getDefaultTree(): ChatTreePath {
    const tree: ChatTreePath = [];

    let humanId = '';
    let aiId = ChatConversation.aiMessageRootId;

    while (true) {
      const humanList = this.data.aiMessageChildIds?.[aiId];
      if (!humanList) {
        break;
      }
      const humanIndex = humanList.length - 1;
      if (humanIndex === -1) {
        throw new Error('Invalid path');
      }
      humanId = humanList[humanIndex];

      const aiList = this.data.humanMessageChildIds?.[humanId];
      if (!aiList) {
        throw new Error('Invalid path');
      }
      const aiIndex = aiList.length - 1;
      if (aiIndex === -1) {
        throw new Error('Invalid path');
      }
      aiId = aiList[aiIndex];

      tree.push({
        humanMessageChildIndex: humanIndex,
        aiMessageChildIndex: aiIndex,
      });
    }

    return tree;
  }

  public getHumanMessageIdAt(tree: ChatTreePath) {
    const pair = this.getMessageIdPairAt(tree);
    if (!pair) {
      return null;
    }
    return pair.human;
  }

  public getAIMessageIdAt(tree: ChatTreePath) {
    const pair = this.getMessageIdPairAt(tree);
    if (!pair) {
      return null;
    }
    return pair.ai;
  }

  public getAIMessageAt(tree: ChatTreePath) {
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

  public pushHumanAiMessagePair(
    path: ChatTreePath,
    humanMessage: HumanMessageData,
    aiMessage: AIMessage
  ): ChatTreePath {
    if (this.data.humanMessages[humanMessage.id]) {
      throw new Error('Human message already exists');
    }
    if (this.data.aiMessages[aiMessage.id]) {
      throw new Error('AI message already exists');
    }

    const parentAiId = this.getAIMessageIdAt(path);
    if (!parentAiId) {
      throw new Error('Invalid path');
    }

    const humanId = humanMessage.id;
    const aiId = aiMessage.id;

    const newAiChildIndex = this.pushNewIndexforAIMessageChildren(parentAiId, humanId);
    const newHumanChildIndex = this.pushNewIndexforHumanMessageChildren(humanId, aiId);

    this.produceData((data) => {
      data.humanMessages[humanId] = humanMessage;
      data.aiMessages[aiId] = castDraft(aiMessage);
    });

    return [
      ...path,
      {
        humanMessageChildIndex: newHumanChildIndex,
        aiMessageChildIndex: newAiChildIndex,
      },
    ];
  }

  public pushUpdatedAiMessage(path: ChatTreePath, aiMessage: AIMessage) {
    if (this.data.aiMessages[aiMessage.id]) {
      throw new Error('AI message already exists');
    }

    const aiId = aiMessage.id;

    const humanMessageId = this.getHumanMessageIdAt(path);
    if (!humanMessageId) {
      throw new Error('Invalid path');
    }

    const newHumanChildIndex = this.pushNewIndexforHumanMessageChildren(humanMessageId, aiId);

    this.produceData((data) => {
      data.aiMessages[aiId] = castDraft(aiMessage);
    });

    // Pop the last path element and push the new one
    return [
      ...path.slice(0, path.length - 1),
      {
        humanMessageChildIndex: newHumanChildIndex,
        aiMessageChildIndex: 0,
      },
    ];
  }

  public asMessagesArray(path: ChatTreePath): (HumanMessageData | AIMessage)[] {
    const messages: (HumanMessageData | AIMessage)[] = [];

    if (path.length === 0) {
      return messages;
    }

    let humanId = '';
    let aiId = ChatConversation.aiMessageRootId;

    for (const selection of path) {
      const nextHumanId = this.data.aiMessageChildIds[aiId]?.[selection.aiMessageChildIndex];
      if (!nextHumanId) {
        throw new Error('Invalid path');
      }
      humanId = nextHumanId;
      const nextAiId = this.data.humanMessageChildIds[humanId]?.[selection.humanMessageChildIndex];
      if (!nextAiId) {
        throw new Error('Invalid path');
      }
      aiId = nextAiId;

      messages.push(this.data.humanMessages[humanId]);
      messages.push(this.data.aiMessages[aiId]);
    }

    return messages;
  }

  public getPathInfoForMessageId(messageId: string): ChatBranchState {
    const getVariantsForMessageId = (ids: Record<string, string[]>) => {
      return Object.values(ids).find((array) => array.includes(messageId));
    };

    const variants =
      getVariantsForMessageId(this.data.aiMessageChildIds) ?? getVariantsForMessageId(this.data.humanMessageChildIds);

    if (!variants) {
      return {
        count: 0,
        index: -1,
      };
    }

    return {
      count: variants.length,
      index: variants.indexOf(messageId),
    };
  }
}

export function concatMessageContent(messageContent: MessageContent, contentToAppend: MessageContent): MessageContent {
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
