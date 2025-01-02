import type { Draft, WritableDraft } from 'immer';
import type { MessageContent } from '../..';
import type { ChatBranchState, ChatTree } from '../branching';
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

  public getBranchInfoForMessageId(messageId: string): ChatBranchState {
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
