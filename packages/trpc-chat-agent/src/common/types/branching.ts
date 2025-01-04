import type { ConversationData } from './conversation/conversation';
import { z } from 'zod';
import { mergeKeepingOldReferences } from '../merge';
import { ChatConversation } from './conversation/conversation';

export const chatBranchZod = z.array(
  z.object({
    humanMessageIndex: z.number(),
    aiMessageIndex: z.number(),
  })
);
export type ChatTreePath = z.infer<typeof chatBranchZod>;

export type ChatBranchState = {
  index: number;
  count: number;
};

export class ConversationBranchState {
  // State
  readonly messageChildChoice: Record<string, string>;

  // Passed in from conversation
  readonly aiMessageChildren: Record<string, string[]>;
  readonly humanMessageChildren: Record<string, string[]>;

  // Derived
  readonly selectedPath: ChatTreePath;
  readonly messageBranchStates: Record<string, ChatBranchState>;
  readonly messageParent: Record<string, string>;

  private constructor(args: {
    aiMessageChildren: Record<string, string[]>;
    humanMessageChildren: Record<string, string[]>;
    messageChildChoice: Record<string, string>;
    selectedPath: ChatTreePath;
    messageBranchStates: Record<string, ChatBranchState>;
    messageParent: Record<string, string>;
  }) {
    this.aiMessageChildren = args.aiMessageChildren;
    this.humanMessageChildren = args.humanMessageChildren;
    this.messageChildChoice = args.messageChildChoice;
    this.selectedPath = args.selectedPath;
    this.messageBranchStates = args.messageBranchStates;
    this.messageParent = args.messageParent;
  }

  /**
   * Factory method to create a new state from conversation data,
   * optionally merging with an existing state to keep references.
   */
  static fromConversation(
    conversation: ConversationData<any>,
    existing?: ConversationBranchState
  ): ConversationBranchState {
    const oldChoice = existing?.messageChildChoice ?? {};
    const newChoice = { ...oldChoice };

    // Set defaults: pick the last child if none chosen
    for (const [id, children] of Object.entries(conversation.aiMessageChildIds)) {
      if (!newChoice[id] && children.length > 0) {
        newChoice[id] = children[children.length - 1];
      }
    }
    for (const [id, children] of Object.entries(conversation.humanMessageChildIds)) {
      if (!newChoice[id] && children.length > 0) {
        newChoice[id] = children[children.length - 1];
      }
    }

    const next = ConversationBranchState.build(
      conversation.aiMessageChildIds,
      conversation.humanMessageChildIds,
      newChoice
    );

    // If we have an old state, do a merge to preserve references if unchanged
    if (existing) {
      return existing.mergeWith(next);
    } else {
      return next;
    }
  }

  /**
   * Creates a default state
   */
  static default(): ConversationBranchState {
    return ConversationBranchState.build({}, {}, {});
  }

  /**
   * Core builder that also generates derived data
   */
  private static build(
    aiMessageChildren: Record<string, string[]>,
    humanMessageChildren: Record<string, string[]>,
    messageChildChoice: Record<string, string>
  ): ConversationBranchState {
    const { selectedPath, messageBranchStates, messageParent } = ConversationBranchState.buildDerivedData(
      aiMessageChildren,
      humanMessageChildren,
      messageChildChoice
    );

    return new ConversationBranchState({
      aiMessageChildren,
      humanMessageChildren,
      messageChildChoice,
      selectedPath,
      messageBranchStates,
      messageParent,
    });
  }

  /** Build derived data in one pass. */
  private static buildDerivedData(
    aiMsg: Record<string, string[]>,
    huMsg: Record<string, string[]>,
    choice: Record<string, string>
  ) {
    const selectedPath: ChatTreePath = [];
    const messageBranchStates: Record<string, ChatBranchState> = {};
    const messageParent: Record<string, string> = {};

    // Build the selected path from the root
    let aiId = ChatConversation.aiMessageRootId;
    let humanId = '';
    while (true) {
      const aiChildren = aiMsg[aiId];
      const chosenAiChild = choice[aiId];
      if (!aiChildren) {
        break;
      }
      const aiIndex = aiChildren.indexOf(chosenAiChild);
      if (aiIndex === -1) {
        throw new Error('Invalid AI choice');
      }

      humanId = chosenAiChild;

      const humanChildren = huMsg[humanId];
      const chosenHumanChild = choice[humanId];

      if (!humanChildren) {
        throw new Error('Invalid Human choice');
      }
      const humanIndex = humanChildren.indexOf(chosenHumanChild);
      if (humanIndex === -1) {
        throw new Error('Invalid Human choice');
      }

      aiId = chosenHumanChild;

      selectedPath.push({
        humanMessageIndex: humanIndex,
        aiMessageIndex: aiIndex,
      });
    }

    // Build branch states and parent pointers
    for (const [id, children] of Object.entries(aiMsg)) {
      messageBranchStates[id] = {
        index: children.indexOf(choice[id]),
        count: children.length,
      };
      for (const child of children) {
        messageParent[child] = id;
      }
    }
    for (const [id, children] of Object.entries(huMsg)) {
      messageBranchStates[id] = {
        index: children.indexOf(choice[id]),
        count: children.length,
      };
      for (const child of children) {
        messageParent[child] = id;
      }
    }

    return { selectedPath, messageBranchStates, messageParent };
  }

  /**
   * Set a single message choice: returns a new state, merges references.
   */
  private setMessageChoice(messageId: string, childId: string): ConversationBranchState {
    const newChoice = { ...this.messageChildChoice, [messageId]: childId };
    const next = ConversationBranchState.build(this.aiMessageChildren, this.humanMessageChildren, newChoice);
    return this.mergeWith(next);
  }

  /**
   * Update from a branch (ChatTreePath) by sequentially choosing children.
   */
  withBranchSelected(path: ChatTreePath): ConversationBranchState {
    // eslint-disable-next-line ts/no-this-alias
    let state: ConversationBranchState = this;
    let aiId = ChatConversation.aiMessageRootId;

    for (const { humanMessageIndex, aiMessageIndex } of path) {
      const nextHuman = state.aiMessageChildren[aiId]?.[humanMessageIndex];
      if (!nextHuman) {
        throw new Error('Invalid path (Human pick)');
      }
      state = state.setMessageChoice(aiId, nextHuman);

      const nextAi = state.humanMessageChildren[nextHuman]?.[aiMessageIndex];
      if (!nextAi) {
        throw new Error('Invalid path (AI pick)');
      }
      state = state.setMessageChoice(nextHuman, nextAi);

      aiId = nextAi;
    }
    return state;
  }

  /**
   * Update a message to a new index in its parent's child list.
   */
  withMessageIndex(atMessageId: string, newIndex: number): ConversationBranchState {
    const parent = this.messageParent[atMessageId];
    if (!parent) {
      throw new Error('Invalid messageId');
    }

    const children = this.aiMessageChildren[parent] ?? this.humanMessageChildren[parent];
    if (!children?.[newIndex]) {
      throw new Error('Invalid child index');
    }
    return this.setMessageChoice(parent, children[newIndex]);
  }

  /**
   * Update from conversation data
   */
  withConversationData(conversation: ConversationData<any>): ConversationBranchState {
    return ConversationBranchState.fromConversation(conversation, this);
  }

  /**
   * Merge references between the old and the new states
   * to avoid rerenders for unchanged objects.
   */
  private mergeWith(next: ConversationBranchState): ConversationBranchState {
    const merged = new ConversationBranchState({
      aiMessageChildren: mergeKeepingOldReferences(this.aiMessageChildren, next.aiMessageChildren),
      humanMessageChildren: mergeKeepingOldReferences(this.humanMessageChildren, next.humanMessageChildren),
      messageChildChoice: mergeKeepingOldReferences(this.messageChildChoice, next.messageChildChoice),
      selectedPath: mergeKeepingOldReferences(this.selectedPath, next.selectedPath),
      messageBranchStates: mergeKeepingOldReferences(this.messageBranchStates, next.messageBranchStates),
      messageParent: mergeKeepingOldReferences(this.messageParent, next.messageParent),
    });
    return merged;
  }
}
