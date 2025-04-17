import type {
  AiMessageContent,
  AiMessageContentClientSide,
  MessageContentToolPartClientSide,
} from '../../messageContent';
import type { AnyStructuredChatTool } from '../../structuredTool';
import { UnreachableError } from '../../../common/unreachable';

export type AIMessageData<Tools extends readonly AnyStructuredChatTool[]> = {
  kind: 'ai';
  id: string;
  parts: AiMessageContent<Tools>[];
  createdAt: string;
};

export class ChatAIMessageWrapper<Tools extends readonly AnyStructuredChatTool[]> {
  constructor(readonly data: AIMessageData<Tools>) {}

  public get id() {
    return this.data.id;
  }

  public get kind() {
    return this.data.kind;
  }

  public asClientSideMessageData(): AIMessageDataClientSide<Tools> {
    return {
      id: this.data.id,
      kind: this.data.kind,
      parts: this.data.parts.map<AiMessageContentClientSide<Tools>>((part) => {
        switch (part.type) {
          case 'text':
            return part;
          case 'special-text':
            return part;
          case 'tool':
            return {
              type: 'tool',
              data: {
                id: part.data.id,
                name: part.data.name,
                args: part.data.client.args,
                result: part.data.client.result,
                state: part.data.state,
              },
              id: part.id,
            } satisfies MessageContentToolPartClientSide<Tools>;
          default:
            throw new UnreachableError(part);
        }
      }),
      createdAt: this.data.createdAt,
    };
  }
}

export type AIMessageDataClientSide<Tools extends readonly AnyStructuredChatTool[]> = {
  kind: 'ai';
  id: string;
  parts: AiMessageContentClientSide<Tools>[];
  createdAt: string;
};
