import type { Draft, WritableDraft } from 'immer';
import type { ChatBranchState, ChatTreePath } from '../branching';
import type { UserMessageData } from '../message/user';
import { castDraft, produce } from 'immer';

export type ConversationData<AIMessage> = {
  id: string;

  messageIdCounter: number;

  aiMessages: Record<string, AIMessage>;
  userMessages: Record<string, UserMessageData>;

  aiMessageChildIds: Record<string, string[]>;
  userMessageChildIds: Record<string, string[]>;

  createdAt: string;
  lastModifiedAt: string;
};

export class ChatConversationHelper<AIMessage extends { id: string }> {
  data: ConversationData<AIMessage>;

  constructor(data: ConversationData<AIMessage>) {
    this.data = data;
  }

  static readonly aiMessageRootId = '_root_';

  protected produceData(fn: (data: WritableDraft<ConversationData<AIMessage>>) => void) {
    this.data = produce(this.data, (data) => {
      fn(data);
      data.lastModifiedAt = new Date().toISOString();
    });
  }

  protected produceAiMessage(messageId: string, fn: (data: Draft<AIMessage>) => void) {
    this.data = produce(this.data, (data) => {
      const aiMessage = data.aiMessages[messageId];
      if (!aiMessage) {
        throw new Error('Invalid messageId');
      }
      fn(aiMessage);

      data.lastModifiedAt = new Date().toISOString();
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
        user: null,
        ai: ChatConversationHelper.aiMessageRootId,
      };
    }

    let userId = '';
    let aiId = ChatConversationHelper.aiMessageRootId;

    for (const selection of tree) {
      const nextUserId = this.data.aiMessageChildIds?.[aiId]?.[selection.aiMessageChildIndex];
      if (!nextUserId) {
        return null;
      }
      userId = nextUserId;
      const nextAiId = this.data.userMessageChildIds?.[userId]?.[selection.userMessageChildIndex];
      if (!nextAiId) {
        return null;
      }
      aiId = nextAiId;
    }

    return {
      user: userId,
      ai: aiId,
    };
  }

  public getDefaultTree(): ChatTreePath {
    const tree: ChatTreePath = [];

    let userId = '';
    let aiId = ChatConversationHelper.aiMessageRootId;

    while (true) {
      const userList = this.data.aiMessageChildIds?.[aiId];
      if (!userList) {
        break;
      }
      const userIndex = userList.length - 1;
      if (userIndex === -1) {
        throw new Error('Invalid path when getting default tree');
      }
      userId = userList[userIndex];

      const aiList = this.data.userMessageChildIds?.[userId];
      if (!aiList) {
        throw new Error('Invalid path when getting default tree');
      }
      const aiIndex = aiList.length - 1;
      if (aiIndex === -1) {
        throw new Error('Invalid path when getting default tree');
      }
      aiId = aiList[aiIndex];

      tree.push({
        userMessageChildIndex: userIndex,
        aiMessageChildIndex: aiIndex,
      });
    }

    return tree;
  }

  public getUserMessageIdAt(tree: ChatTreePath) {
    const pair = this.getMessageIdPairAt(tree);
    if (!pair) {
      return null;
    }
    return pair.user;
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

  public getUserMessageAt(tree: ChatTreePath) {
    const userId = this.getUserMessageIdAt(tree);
    if (!userId) {
      return null;
    }
    return this.data.userMessages?.[userId];
  }

  private pushNewIndexforUserMessageChildren(userId: string, childAiId: string) {
    let newIndex = 0;
    this.produceData((data) => {
      if (!data.userMessageChildIds?.[userId]) {
        data.userMessageChildIds[userId] = [];
      }
      const array = data.userMessageChildIds[userId];
      newIndex = array.length;
      array.push(childAiId);
    });

    return newIndex;
  }

  private pushNewIndexforAIMessageChildren(aiId: string, childUserId: string) {
    let newIndex = 0;
    this.produceData((data) => {
      if (!data.aiMessageChildIds?.[aiId]) {
        data.aiMessageChildIds[aiId] = [];
      }
      const array = data.aiMessageChildIds[aiId];
      newIndex = array.length;
      array.push(childUserId);
    });

    return newIndex;
  }

  public pushUserAiMessagePair(path: ChatTreePath, userMessage: UserMessageData, aiMessage: AIMessage): ChatTreePath {
    if (this.data.userMessages[userMessage.id]) {
      throw new Error('User message already exists');
    }
    if (this.data.aiMessages[aiMessage.id]) {
      throw new Error('AI message already exists');
    }

    const parentAiId = this.getAIMessageIdAt(path);
    if (!parentAiId) {
      throw new Error('Invalid path');
    }

    const userId = userMessage.id;
    const aiId = aiMessage.id;

    const newAiChildIndex = this.pushNewIndexforAIMessageChildren(parentAiId, userId);
    const newUserChildIndex = this.pushNewIndexforUserMessageChildren(userId, aiId);

    this.produceData((data) => {
      data.userMessages[userId] = userMessage;
      data.aiMessages[aiId] = castDraft(aiMessage);
    });

    return [
      ...path,
      {
        userMessageChildIndex: newUserChildIndex,
        aiMessageChildIndex: newAiChildIndex,
      },
    ];
  }

  public pushUpdatedAiMessage(path: ChatTreePath, aiMessage: AIMessage) {
    if (this.data.aiMessages[aiMessage.id]) {
      throw new Error('AI message already exists');
    }

    const aiId = aiMessage.id;

    const userMessageId = this.getUserMessageIdAt(path);
    if (!userMessageId) {
      throw new Error('Invalid path');
    }

    const newUserChildIndex = this.pushNewIndexforUserMessageChildren(userMessageId, aiId);

    this.produceData((data) => {
      data.aiMessages[aiId] = castDraft(aiMessage);
    });

    const lastPathElement = path[path.length - 1];

    // Pop the last path element and push the new one
    return [
      ...path.slice(0, path.length - 1),
      {
        userMessageChildIndex: newUserChildIndex,
        aiMessageChildIndex: lastPathElement.aiMessageChildIndex,
      },
    ];
  }

  public asMessagesArray(path: ChatTreePath): (UserMessageData | AIMessage)[] {
    const messages: (UserMessageData | AIMessage)[] = [];

    if (path.length === 0) {
      return messages;
    }

    let userId = '';
    let aiId = ChatConversationHelper.aiMessageRootId;

    for (const selection of path) {
      const nextUserId = this.data.aiMessageChildIds[aiId]?.[selection.aiMessageChildIndex];
      if (!nextUserId) {
        throw new Error('Invalid path');
      }
      userId = nextUserId;
      const nextAiId = this.data.userMessageChildIds[userId]?.[selection.userMessageChildIndex];
      if (!nextAiId) {
        throw new Error('Invalid path');
      }
      aiId = nextAiId;

      messages.push(this.data.userMessages[userId]);
      messages.push(this.data.aiMessages[aiId]);
    }

    return messages;
  }

  public isPathValid(path: ChatTreePath): boolean {
    let userId = '';
    let aiId = ChatConversationHelper.aiMessageRootId;

    for (const selection of path) {
      const nextUserId = this.data.aiMessageChildIds[aiId]?.[selection.aiMessageChildIndex];
      if (!nextUserId) {
        return false;
      }
      userId = nextUserId;
      const nextAiId = this.data.userMessageChildIds[userId]?.[selection.userMessageChildIndex];
      if (!nextAiId) {
        return false;
      }
      aiId = nextAiId;
    }

    return true;
  }

  public getPathInfoForMessageId(messageId: string): ChatBranchState {
    const getVariantsForMessageId = (ids: Record<string, string[]>) => {
      return Object.values(ids).find((array) => array.includes(messageId));
    };

    const variants =
      getVariantsForMessageId(this.data.aiMessageChildIds) ?? getVariantsForMessageId(this.data.userMessageChildIds);

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
