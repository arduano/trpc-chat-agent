import type { AIMessageWithCallbacks, AnyStructuredChatTool, HumanMessageData } from '@arduano/trpc-chat-agent';
import type { AgentType } from '../../../server/src/agent';
import { useConversation } from '@arduano/trpc-chat-agent-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { rawTrpc } from '../trpc';
import { RenderTool } from './RenderTool';

export function Chat() {
  const { id: conversationId } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const { messages, beginMessage, isStreaming } = useConversation<AgentType>({
    router: rawTrpc.chat,
    initialConversationId: conversationId,
    onUpdateConversationId: (newId) => {
      navigate(`/chat/${newId}`, { replace: true });
    },
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    beginMessage(input);
    setInput('');
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-screen-xl sm:mx-auto w-full px-4">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-light-blue-500 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"></div>
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-screen-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <div className="h-[60vh] overflow-auto mb-4 space-y-4 pr-4">
                  <RenderMessages
                    messages={messages}
                    renderAiMessage={(message) => (
                      <>
                        {message.parts.map((part, i) => (
                          <React.Fragment key={i}>
                            {part.content && (
                              <div className="p-4 rounded-lg bg-gray-100 mr-8">{part.content as string}</div>
                            )}
                            {part.toolCalls.map((toolCall) => (
                              <RenderTool key={toolCall.id} tool={toolCall} />
                            ))}
                          </React.Fragment>
                        ))}
                      </>
                    )}
                    renderHumanMessage={(message) => (
                      <div className="p-4 rounded-lg bg-blue-100 ml-8">{message.content as string}</div>
                    )}
                  />
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSubmit} className="mt-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={isStreaming}
                      className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Type your message..."
                    />
                    <button
                      type="submit"
                      disabled={isStreaming || !input.trim()}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Send
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RenderMemoed<T>({ data, render }: { data: T; render: (data: T) => JSX.Element }) {
  const jsx = useMemo(() => render(data), [data]);
  return <>{jsx}</>;
}

function RenderMessages<Tools extends readonly AnyStructuredChatTool[]>({
  messages,
  renderAiMessage,
  renderHumanMessage,
}: {
  messages: (AIMessageWithCallbacks<Tools> | HumanMessageData)[];
  renderAiMessage: (message: AIMessageWithCallbacks<Tools>) => JSX.Element;
  renderHumanMessage: (message: HumanMessageData) => JSX.Element;
}) {
  return (
    <>
      {messages.map((message) => {
        if (message.kind === 'human') {
          return <RenderMemoed key={message.id} data={message} render={renderHumanMessage} />;
        } else {
          return <RenderMemoed key={message.id} data={message} render={renderAiMessage} />;
        }
      })}
    </>
  );
}
