import type {
  AgentTools,
  AIMessageToolCallWithCallbacks,
  ToolCallState,
  ToolCallWithCallbacks,
} from '@arduano/trpc-chat-agent';
import type { AgentType } from '../../../server/src/agent';
import React from 'react';
import {
  HiOutlineCalculator,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineClipboard,
  HiOutlineClock,
  HiOutlineCloud,
  HiOutlineExclamationCircle,
} from 'react-icons/hi2';
import { twMerge } from 'tailwind-merge';

export function RenderTool({ tool }: { tool: AIMessageToolCallWithCallbacks<AgentTools<AgentType>> }) {
  switch (tool.name) {
    case 'calculator':
      return (
        <ToolCallWrapper tool={tool}>
          <div className="flex gap-2">
            <span className="font-semibold">Operation:</span>
            <span>{tool.args?.operation}</span>
            <span className="font-semibold ml-4">Values:</span>
            <span>
              {tool.args?.a} and {tool.args?.b}
            </span>
          </div>
          {tool.result &&
            ('error' in tool.result ? (
              <ToolResultWrapper color="red" icon={<HiOutlineExclamationCircle size={24} />}>
                <span>{tool.result.error}</span>
              </ToolResultWrapper>
            ) : (
              <ToolResultWrapper
                color="green"
                icon={<HiOutlineCalculator size={24} />}
                subtitle="Result"
                title={String(tool.result.result)}
              />
            ))}
        </ToolCallWrapper>
      );

    case 'weather':
      return (
        <ToolCallWrapper tool={tool}>
          <div className="flex gap-2">
            <span className="font-semibold">City:</span>
            <span>{tool.args?.city}</span>
          </div>
          {tool.progressStatus?.status && (
            <div className="mt-1 text-sm text-background-400">{tool.progressStatus.status}</div>
          )}
          {tool.result && (
            <ToolResultWrapper color="blue" icon={<HiOutlineCloud size={24} />}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-sm text-background-400">Temperature</div>
                  <div className="text-lg font-semibold">{tool.result.temp}°C</div>
                </div>
                <div>
                  <div className="text-sm text-background-400">Condition</div>
                  <div className="text-lg font-semibold capitalize">{tool.result.condition}</div>
                </div>
              </div>
            </ToolResultWrapper>
          )}
        </ToolCallWrapper>
      );

    case 'todos':
      return (
        <ToolCallWrapper tool={tool}>
          <div className="flex gap-2">
            <span className="font-semibold">Action:</span>
            <span>{tool.args?.action}</span>
            {tool.args?.task && (
              <>
                <span className="font-semibold ml-4">Task:</span>
                <span>{tool.args.task}</span>
              </>
            )}
          </div>
          {tool.result && (
            <ToolResultWrapper color="yellow" icon={<HiOutlineClipboard size={24} />}>
              <div className="mb-2 text-sm text-background-400">
                Last action: <span className="font-medium capitalize">{tool.result.action}</span>
              </div>
              {tool.result.todos.length === 0 ? (
                <div className="text-background-400 italic">No todos</div>
              ) : (
                <ul className="space-y-1">
                  {tool.result.todos.map((todo, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-purple-200 bg-purple-50 text-xs text-purple-500">
                        {i + 1}
                      </div>
                      <span>{todo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ToolResultWrapper>
          )}
        </ToolCallWrapper>
      );

    case 'timer':
      return (
        <ToolCallWrapper tool={tool}>
          <div className="flex gap-2">
            <span className="font-semibold">Duration:</span>
            <span>{tool.args?.seconds} seconds</span>
          </div>
          {tool.state !== 'complete' && tool.progressStatus && (
            <div className="mt-1">
              <div className="flex items-center gap-2">
                <div className="h-1 flex-grow rounded-full bg-background-200">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${tool.progressStatus.progress}%` }}
                  />
                </div>
                <span className="text-sm text-background-400">{tool.progressStatus.message}</span>
              </div>
            </div>
          )}
          {tool.result && (
            <ToolResultWrapper
              color="purple"
              icon={<HiOutlineClock size={24} />}
              subtitle="Duration"
              title={`${tool.result.duration} seconds`}
            />
          )}
        </ToolCallWrapper>
      );

    case 'prompt-user':
      return (
        <ToolCallWrapper tool={tool}>
          {tool.callbacks.map((callback) => (
            <ToolResultWrapper
              key={callback.callbackId}
              color="purple"
              icon={<HiOutlineChatBubbleOvalLeft size={24} />}
              subtitle="User Input Required"
              title="Please provide a response"
            >
              <div className="mt-4">
                <PromptUserInput
                  onSubmit={(response) => {
                    callback.respond({
                      response,
                    });
                  }}
                />
              </div>
            </ToolResultWrapper>
          ))}
        </ToolCallWrapper>
      );

    default:
      return (
        <ToolCallWrapper tool={tool}>
          <div className="text-background-400">Unknown tool: {(tool as any).name}</div>
        </ToolCallWrapper>
      );
  }
}

const getStatusColor = (state: ToolCallState) => {
  switch (state) {
    case 'loading':
      return 'bg-blue-600';
    case 'complete':
      return 'bg-green-600';
    case 'aborted':
      return 'bg-red-600';
    default:
      return 'bg-background-600';
  }
};

const colorClasses = {
  red: 'bg-red-950 border-red-700 text-red-100',
  green: 'bg-green-950 border-green-700 text-green-100',
  blue: 'bg-blue-950 border-blue-700 text-blue-100',
  yellow: 'bg-yellow-950 border-yellow-700 text-yellow-100',
  purple: 'bg-purple-950 border-purple-700 text-purple-100',
  background: 'bg-background-950 border-background-700 text-background-100',
} as const;

const iconColorClasses = {
  red: 'text-red-400',
  green: 'text-green-400',
  blue: 'text-blue-400',
  yellow: 'text-yellow-400',
  purple: 'text-purple-400',
  background: 'text-background-400',
} as const;

interface ToolCallWrapperProps {
  children?: React.ReactNode;
  tool: ToolCallWithCallbacks<any>;
}

function ToolCallWrapper({ children, tool }: ToolCallWrapperProps) {
  return (
    <div className="my-2 rounded-lg border text-background-100 border-background-700 bg-background-900 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${getStatusColor(tool.state)}`} />
        <h3 className="font-medium capitalize ">{tool.name}</h3>
        <span className="text-sm text-background-400">({tool.state})</span>
      </div>
      {children}
    </div>
  );
}

interface ToolResultWrapperProps {
  icon: React.ReactNode;
  color: keyof typeof colorClasses;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

function ToolResultWrapper({ icon, color, title, subtitle, children }: ToolResultWrapperProps) {
  return (
    <div className={twMerge('mt-4 p-4 rounded-lg border', colorClasses[color])}>
      <div className="flex items-start">
        <div className={twMerge('p-2 rounded-lg', iconColorClasses[color])}>{icon}</div>
        <div className="ml-4 flex-1">
          {title && <div className="font-semibold">{title}</div>}
          {subtitle && <div className="text-sm text-background-400">{subtitle}</div>}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

function PromptUserInput({ onSubmit }: { onSubmit: (response: string) => void }) {
  const [response, setResponse] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(response);
    setResponse('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3">
        <input
          type="text"
          className="w-full rounded-md border border-background-700 bg-background-900 px-3 py-2 text-white placeholder-background-400 focus:border-blue-600 focus:outline-none"
          placeholder="Enter your response..."
          value={response}
          onChange={(e) => setResponse(e.target.value)}
        />
        <button
          type="submit"
          className="w-fit rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Submit
        </button>
      </div>
    </form>
  );
}
