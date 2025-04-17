import type { UserMessageContent } from '../../messageContent';

export type UserMessageData = {
  kind: 'user';
  id: string;
  parts: UserMessageContent[];
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

  public get parts() {
    return this.data.parts;
  }
}
