import type {
  AIMessageWithCallbacks,
  AnyStructuredChatTool,
  ChatPathStateWithSwitch,
  HumanMessageWithCallbacks,
} from '@arduano/trpc-chat-agent';
import type { AgentType } from '../../../server/src/agent';
import { useConversation } from '@arduano/trpc-chat-agent-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaPencilAlt, FaRedo, FaTimes } from 'react-icons/fa';
import Markdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import { twMerge } from 'tailwind-merge';
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
    <div className="min-h-screen bg-background-900 flex flex-col">
      <div className="flex-1 w-full flex flex-col">
        <div className="flex-1 flex gap-4 flex-col h-screen max-h-screen">
          <div className="flex-1 overflow-auto py-4 scrollbar scrollbar-thumb-zinc-700 scrollbar-track-zinc-900">
            <div className="max-w-6xl w-full mx-auto px-4 space-y-4">
              <RenderMessages
                messages={messages}
                renderAiMessage={(message) => <AIMessage message={message} />}
                renderHumanMessage={(message) => <HumanMessage message={message} />}
              />
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div className="max-w-6xl w-full mx-auto px-4">
            <form onSubmit={handleSubmit} className="mt-2 mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isStreaming}
                  className="flex-1 p-3 bg-gray-800 text-white border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 placeholder-gray-400"
                  placeholder="Type your message..."
                />
                <button
                  type="submit"
                  disabled={isStreaming || !input.trim()}
                  className="px-6 py-3 bg-accent-600 text-white rounded-lg disabled:opacity-50 hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 transition-colors"
                >
                  Send
                </button>
              </div>
            </form>
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

interface MessageVariantsProps {
  path: ChatPathStateWithSwitch;
}

function MessageVariants({ path }: MessageVariantsProps) {
  return (
    <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
      {Array.from({ length: path.count }, (_, i) => (
        <button
          key={i}
          onClick={() => path.switchTo(i)}
          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
            path.index === i ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-300'
          }`}
          aria-label={`Switch to variant ${i + 1}`}
        >
          {i + 1}
        </button>
      ))}
    </div>
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
    <div className="flex items-start gap-2 pl-12 lg:pl-48">
      <button
        onClick={() => setIsEditing(!isEditing)}
        className={twMerge(
          'mt-2 p-2 text-gray-400 hover:text-gray-300 transition-colors',
          message.path.count > 1 && 'mt-7'
        )}
        aria-label={isEditing ? 'Cancel editing' : 'Edit message'}
      >
        {isEditing ? <FaTimes size={14} /> : <FaPencilAlt size={14} />}
      </button>
      <div className="flex-1">
        {message.path.count > 1 && <MessageVariants path={message.path} />}
        {isEditing ? (
          <form onSubmit={handleSubmit} className="flex-1">
            <div className="flex gap-2">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="flex-1 p-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500 resize-none"
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
                className="px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 h-fit transition-colors"
              >
                Send
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 rounded-lg bg-accent-950 text-white markdown">
            <Markdown>{message.content as string}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}

interface AIMessageProps {
  message: AIMessageWithCallbacks<AgentType>;
}

export function AIMessage({ message }: AIMessageProps) {
  return (
    <div className="flex items-start gap-2 pr-12 lg:pr-48">
      <div className="flex-1">
        {message.path.count > 1 && <MessageVariants path={message.path} />}
        {message.parts.map((part, i) => (
          <React.Fragment key={i}>
            {part.content && (
              <div className="p-4 rounded-lg bg-background-800 text-white markdown">
                <Markdown>{part.content as string}</Markdown>
              </div>
            )}
            {part.toolCalls.map((toolCall) => (
              <RenderTool key={toolCall.id} tool={toolCall} />
            ))}
          </React.Fragment>
        ))}
      </div>
      <button
        onClick={() => message.regenerate()}
        className={twMerge(
          'mt-2 p-2 text-gray-400 hover:text-gray-300 transition-colors',
          message.path.count > 1 && 'mt-7'
        )}
        aria-label="Regenerate response"
      >
        <FaRedo size={14} />
      </button>
    </div>
  );
}
