import type {
  AnyStructuredChatTool,
  ChatAIMessage,
  ChatAIMessagePart,
  ChatAIMessageToolCall,
  ChatUserMessage,
  GetToolByName,
  MessageContent,
} from '@trpc-chat-agent/core';

import { useCallback, useMemo } from 'react';

function RenderMemoed<T extends readonly any[]>({ data, render }: { data: T; render: (...args: T) => JSX.Element }) {
  const jsx = useMemo(() => (!render ? 'Error: render function was missing' : render(...data)), data);
  return jsx;
}

export type RenderMessagesProps<Tools extends readonly AnyStructuredChatTool[]> = {
  messages: (ChatAIMessage<Tools> | ChatUserMessage)[];
  renderAiMessageShell?: (message: ChatAIMessage<Tools>, children: JSX.Element) => JSX.Element;
  renderAiMessagePartContent: (content: MessageContent) => JSX.Element;
  renderToolCallShell?: (toolCall: ChatAIMessageToolCall<Tools>, children: JSX.Element) => JSX.Element;
  renderToolCall:
    | {
        [K in Tools[number]['TypeInfo']['Name']]: (
          toolCall: ChatAIMessageToolCall<GetToolByName<K, Tools>>
        ) => JSX.Element;
      }
    | ((toolCall: ChatAIMessageToolCall<Tools>) => JSX.Element);
  renderUserMessage: (message: ChatUserMessage) => JSX.Element;
};

export function RenderMessages<Tools extends readonly AnyStructuredChatTool[]>({
  messages,
  renderUserMessage,
  renderAiMessagePartContent,
  renderToolCall,
  renderAiMessageShell,
  renderToolCallShell,
}: RenderMessagesProps<Tools>) {
  const defaultShellRender = useCallback((_data: any, children: JSX.Element) => <>{children}</>, []);

  renderAiMessageShell ??= defaultShellRender;
  renderToolCallShell ??= defaultShellRender;

  const renderSingleToolCall = (toolCall: ChatAIMessageToolCall<Tools>) => {
    const toolCallRenderFn = typeof renderToolCall === 'function' ? renderToolCall : renderToolCall[toolCall.name];

    if (!toolCallRenderFn) {
      return <>{`Tool call with name "${toolCall.name}" not found`}</>;
    }

    return <RenderMemoed key={toolCall.id} data={[toolCall as any]} render={toolCallRenderFn as any} />;
  };

  const renderAllToolCalls = (toolCalls: ChatAIMessageToolCall<Tools>[]) => {
    return (
      <>
        {toolCalls.map((toolCall) => {
          const toolCallRendered = renderSingleToolCall(toolCall);
          return <RenderMemoed key={toolCall.id} data={[toolCall, toolCallRendered]} render={renderToolCallShell} />;
        })}
      </>
    );
  };

  const renderAiMessagePart = (message: ChatAIMessagePart<Tools>) => {
    const content = <RenderMemoed data={[message.content]} render={renderAiMessagePartContent} />;
    const toolCalls = <RenderMemoed data={[message.toolCalls]} render={renderAllToolCalls} />;
    return (
      <>
        {content}
        {toolCalls}
      </>
    );
  };

  const renderAiMessage = (message: ChatAIMessage<Tools>) => {
    const parts = (
      <>
        {message.parts.map((part, i) => (
          <RenderMemoed key={i} data={[part]} render={renderAiMessagePart} />
        ))}
      </>
    );

    return <RenderMemoed data={[message, parts]} render={renderAiMessageShell} />;
  };

  const renderAllMessages = (messages: (ChatAIMessage<Tools> | ChatUserMessage)[]) => {
    return (
      <>
        {messages.map((message) => {
          if (message.kind === 'user') {
            return <RenderMemoed key={message.id} data={[message]} render={renderUserMessage} />;
          } else {
            return <RenderMemoed key={message.id} data={[message]} render={renderAiMessage} />;
          }
        })}
      </>
    );
  };

  return <RenderMemoed data={[messages]} render={renderAllMessages} />;
}
