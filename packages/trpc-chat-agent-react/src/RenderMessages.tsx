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

function RenderMemoed<T extends readonly any[]>({ data, render }: { data: T; render: (...args: T) => JSX.Element }) {
  const jsx = useMemo(() => (!render ? 'Error: render function was missing' : render(...data)), data);
  return jsx;
}

export type RenderMessagesProps<Agent extends AnyChatAgent> = {
  messages: (ChatAIMessage<Agent> | ChatUserMessage<Agent>)[];
  renderAiMessageShell?: (message: ChatAIMessage<Agent>, children: JSX.Element) => JSX.Element;
  renderAiMessagePartContent: (content: MessageContent) => JSX.Element;
  renderToolCallShell?: (toolCall: ChatAIMessageToolCall<Agent>, children: JSX.Element) => JSX.Element;
  renderToolCall:
    | {
        [K in AgentTools<Agent>[number]['TypeInfo']['Name']]: (
          toolCall: ChatAIMessageToolCall<GetToolByName<K, Agent>>
        ) => JSX.Element;
      }
    | ((toolCall: ChatAIMessageToolCall<Agent>) => JSX.Element);
  renderUserMessage: (message: ChatUserMessage<Agent>) => JSX.Element;
};

export function RenderMessages<Agent extends AnyChatAgent>({
  messages,
  renderUserMessage,
  renderAiMessagePartContent,
  renderToolCall,
  renderAiMessageShell,
  renderToolCallShell,
}: RenderMessagesProps<Agent>) {
  const defaultShellRender = useCallback((_data: any, children: JSX.Element) => <>{children}</>, []);

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

  const renderAiMessagePart = (message: ChatAIMessagePart<Agent>) => {
    const content = <RenderMemoed data={[message.content]} render={renderAiMessagePartContent} />;
    const toolCalls = <RenderMemoed data={[message.toolCalls]} render={renderAllToolCalls} />;
    return (
      <>
        {content}
        {toolCalls}
      </>
    );
  };

  const renderAiMessage = (message: ChatAIMessage<Agent>) => {
    const parts = (
      <>
        {message.parts.map((part, i) => (
          <RenderMemoed key={i} data={[part]} render={renderAiMessagePart} />
        ))}
      </>
    );

    return <RenderMemoed data={[message, parts]} render={renderAiMessageShell} />;
  };

  const renderAllMessages = (messages: (ChatAIMessage<Agent> | ChatUserMessage<Agent>)[]) => {
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
