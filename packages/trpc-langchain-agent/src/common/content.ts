import { MessageContentComplex, MessageContent } from '@langchain/core/messages';

const contentTypesThatShouldBeString = ['text', 'text_delta'];
const allowedClientContentTypes = [...contentTypesThatShouldBeString];
function mapMessagePartToStringIfNecessary(content: MessageContentComplex): MessageContentComplex | string | null {
  if (typeof content === 'string') {
    return content;
  }

  if (content.type && !allowedClientContentTypes.includes(content.type)) {
    return null;
  }

  if (content.type && contentTypesThatShouldBeString.includes(content.type)) {
    return (content as any).text ?? '';
  }

  return content;
}

export function processMessageContentForClient(content: MessageContent): MessageContent {
  if (typeof content === 'string') {
    return content;
  }

  const mapped = content.map(mapMessagePartToStringIfNecessary).filter((c) => !!c);
  if (mapped.find((c): c is string => typeof c !== 'string')) {
    // If there's a non-string content, map strings to be objects
    return content.map((c) => (typeof c === 'string' ? { type: 'text', text: c } : c));
  } else {
    return mapped.join('');
  }
}
