import type { MessageContent } from '../../messageContent';

export type UserMessageData = {
  kind: 'user';
  id: string;
  content: MessageContent;
  createdAt: string;
};

export class ChatUserMessageWrapper {
  constructor(readonly data: UserMessageData) {}

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
}
