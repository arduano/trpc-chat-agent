import type {
  AgentTools,
  AnyChatAgent,
  ChatAIMessage,
  ChatAIMessageToolCall,
  ChatUserMessage,
  GetToolByName,
  MessageContentSpecialTextPart,
  MessageContentTextPart,
} from '@trpc-chat-agent/core';
import React, { useCallback, useMemo } from 'react';

function RenderMemoed<T extends readonly any[]>({
  data,
  render,
}: {
  data: T;
  render: (...args: T) => React.ReactNode;
}) {
  const jsx = useMemo(() => (!render ? 'Error: render function was missing' : render(...data)), data);
  return jsx;
}

export type RenderMessagesProps<Agent extends AnyChatAgent> = {
  messages: (ChatAIMessage<Agent> | ChatUserMessage)[];
  isStreaming?: boolean;
  renderAiMessageShell?: (
    message: ChatAIMessage<Agent>,
    children: React.ReactNode,
    options: { isLastMessage: boolean }
  ) => React.ReactNode;
  renderAiMessageContent: (content: MessageContentTextPart, options: { isLastMessagePart: boolean }) => React.ReactNode;
  renderAiSpecialContent?: (
    content: MessageContentSpecialTextPart,
    options: { isLastMessagePart: boolean }
  ) => React.ReactNode;
  renderToolCallShell?: (toolCall: ChatAIMessageToolCall<Agent>, children: React.ReactNode) => React.ReactNode;
  renderToolCall:
    | {
        [K in AgentTools<Agent>[number]['TypeInfo']['Name']]: (
          toolCall: ChatAIMessageToolCall<GetToolByName<K, Agent>>
        ) => React.ReactNode;
      }
    | ((toolCall: ChatAIMessageToolCall<Agent>) => React.ReactNode);
  renderUserMessage: (message: ChatUserMessage) => React.ReactNode;
  renderThinkingIndicator?: () => React.ReactNode;
};

export function RenderMessages<Agent extends AnyChatAgent>({
  messages,
  isStreaming,
  renderUserMessage,
  renderAiMessageContent,
  renderAiSpecialContent,
  renderToolCall,
  renderAiMessageShell,
  renderToolCallShell,
  renderThinkingIndicator,
}: RenderMessagesProps<Agent>) {
  const defaultShellRender = useCallback((_data: any, children: React.ReactNode) => <>{children}</>, []);

  renderAiMessageShell ??= defaultShellRender;
  renderToolCallShell ??= defaultShellRender;

  const renderSingleToolCall = (toolCall: ChatAIMessageToolCall<Agent>) => {
    const toolCallRenderFn = typeof renderToolCall === 'function' ? renderToolCall : renderToolCall[toolCall.name];

    if (!toolCallRenderFn) {
      return <>{`Tool call with name "${toolCall.name}" not found`}</>;
    }

    return <RenderMemoed key={toolCall.id} data={[toolCall as any]} render={toolCallRenderFn as any} />;
  };

  const renderAiMessage = (message: ChatAIMessage<Agent>, isLastMessage: boolean, isStreaming: boolean) => {
    const allToolCallsResolved = !message.parts.find((p) => p.type === 'tool' && p.data.state === 'loading');
    const lastPart = message.parts[message.parts.length - 1];
    const lastPartHasNoText = !lastPart || lastPart.type === 'tool' || lastPart.text === '';

    const shouldShowLoadingIndicator = isStreaming && allToolCallsResolved && lastPartHasNoText;

    const parts = (
      <>
        {message.parts.map((part, i) => {
          switch (part.type) {
            case 'tool': {
              const toolCallRendered = renderSingleToolCall(part.data);
              return <RenderMemoed key={part.id} data={[part.data, toolCallRendered]} render={renderToolCallShell} />;
            }
            case 'text': {
              return (
                <RenderMemoed
                  key={part.id}
                  data={[part, { isLastMessagePart: i === message.parts.length - 1 }]}
                  render={renderAiMessageContent}
                />
              );
            }
            case 'special-text': {
              if (renderAiSpecialContent) {
                return (
                  <RenderMemoed
                    key={part.id}
                    data={[part, { isLastMessagePart: i === message.parts.length - 1 }]}
                    render={renderAiSpecialContent}
                  />
                );
              } else {
                return <React.Fragment key={part.id} />;
              }
            }
            default: {
              return <React.Fragment key={i} />;
            }
          }
        })}

        {shouldShowLoadingIndicator && renderThinkingIndicator?.()}
      </>
    );

    return <RenderMemoed data={[message, parts, { isLastMessage }]} render={renderAiMessageShell} />;
  };

  const renderAllMessages = (messages: (ChatAIMessage<Agent> | ChatUserMessage)[]) => {
    return (
      <>
        {messages.map((message, i) => {
          if (message.kind === 'user') {
            return <RenderMemoed key={message.id} data={[message]} render={renderUserMessage} />;
          } else {
            const isLastMessage = i === messages.length - 1;
            return (
              <RenderMemoed
                key={message.id}
                data={[message, isLastMessage, isStreaming ?? false]}
                render={renderAiMessage}
              />
            );
          }
        })}
      </>
    );
  };

  return <RenderMemoed data={[messages]} render={renderAllMessages} />;
}
