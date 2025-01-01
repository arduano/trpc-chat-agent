/*
 * Message content types copied from LangChain
 */

export type ImageDetail = 'auto' | 'low' | 'high';
export type MessageContentText = {
  type: 'text';
  text: string;
};
export type MessageContentImageUrl = {
  type: 'image_url';
  image_url:
    | string
    | {
        url: string;
        detail?: ImageDetail;
      };
};
export type MessageContentComplex =
  | MessageContentText
  | MessageContentImageUrl
  | (Record<string, any> & {
      type?: 'text' | 'image_url' | string;
    })
  | (Record<string, any> & {
      type?: never;
    });
export type MessageContent = string | MessageContentComplex[];
