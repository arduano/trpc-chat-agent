import type {
  AgentTools,
  AnyChatAgent,
  ChatAIMessage,
  ChatAIMessagePart,
  ChatAIMessageToolCall,
  ChatUserMessage,
  GetToolByName,
  MessageContent,
} from '@trpc-chat-agent/core';

import { useCallback, useMemo } from 'react';

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
  renderAiMessagePartContent: (content: MessageContent, options: { isLastMessagePart: boolean }) => React.ReactNode;
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
  renderAiMessagePartContent,
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

  const renderAllToolCalls = (toolCalls: ChatAIMessageToolCall<Agent>[]) => {
    return (
      <>
        {toolCalls.map((toolCall) => {
          const toolCallRendered = renderSingleToolCall(toolCall);
          return <RenderMemoed key={toolCall.id} data={[toolCall, toolCallRendered]} render={renderToolCallShell} />;
        })}
      </>
    );
  };

  const renderAiMessagePart = (message: ChatAIMessagePart<Agent>, isLastMessagePart: boolean, isStreaming: boolean) => {
    const content = (
      <RenderMemoed data={[message.content, { isLastMessagePart }]} render={renderAiMessagePartContent} />
    );
    const toolCalls = <RenderMemoed data={[message.toolCalls]} render={renderAllToolCalls} />;

    const isContentEmpty = !message.content.length && !message.toolCalls.length;

    return (
      <>
        {content}
        {toolCalls}
        {isContentEmpty && isLastMessagePart && isStreaming && renderThinkingIndicator && renderThinkingIndicator()}
      </>
    );
  };

  const renderAiMessage = (message: ChatAIMessage<Agent>, isLastMessage: boolean, isStreaming: boolean) => {
    const parts = (
      <>
        {message.parts.map((part, i) => (
          <RenderMemoed
            key={i}
            data={[part, isLastMessage && i === message.parts.length - 1, isStreaming]}
            render={renderAiMessagePart}
          />
        ))}
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
