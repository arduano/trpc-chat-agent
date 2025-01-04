import type {
  AIMessageWithCallbacks,
  AnyStructuredChatTool,
  HumanMessageWithCallbacks,
} from '@arduano/trpc-chat-agent';
import type { AgentType } from '../../../server/src/agent';
import { useConversation } from '@arduano/trpc-chat-agent-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaPencilAlt } from 'react-icons/fa';
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
                    renderHumanMessage={(message) => <HumanMessage message={message} />}
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
  messages: (AIMessageWithCallbacks<Tools> | HumanMessageWithCallbacks)[];
  renderAiMessage: (message: AIMessageWithCallbacks<Tools>) => JSX.Element;
  renderHumanMessage: (message: HumanMessageWithCallbacks) => JSX.Element;
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

interface HumanMessageProps {
  message: HumanMessageWithCallbacks;
}

export function HumanMessage({ message }: HumanMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content as string);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    message.edit(editedContent);
    setIsEditing(false);
  };

  return (
    <div className="flex items-start gap-2">
      <button
        onClick={() => setIsEditing(true)}
        className="mt-2 p-2 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Edit message"
      >
        <FaPencilAlt size={14} />
      </button>
      {isEditing ? (
        <form onSubmit={handleSubmit} className="flex-1">
          <div className="flex gap-2">
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="flex-1 p-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              autoFocus
              rows={Math.max(1, editedContent.split('\n').length)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 h-fit"
            >
              Send
            </button>
          </div>
        </form>
      ) : (
        <div className="p-4 rounded-lg bg-blue-100 flex-1">{message.content as string}</div>
      )}
    </div>
  );
}

interface AIMessageProps {
  message: AIMessageWithCallbacks<AgentType>;
}

export function AIMessage({ message }: AIMessageProps) {
  return (
    <>
      {message.parts.map((part, i) => (
        <React.Fragment key={i}>
          {part.content && <div className="p-4 rounded-lg bg-gray-100 mr-8">{part.content as string}</div>}
          {part.toolCalls.map((toolCall) => (
            <RenderTool key={toolCall.id} tool={toolCall} />
          ))}
        </React.Fragment>
      ))}
    </>
  );
}
