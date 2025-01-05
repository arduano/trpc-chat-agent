'use client';

import type { AgentType } from '@/server/agent';
import type { AgentTools, ChatAIMessageToolCall } from '@trpc-chat-agent/core';
import { ToolCallWrapper } from '@/components/chat/ToolCallWrapper';
import { ToolResultWrapper } from '@/components/chat/ToolResultWrapper';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import React, { useState } from 'react';
import {
  HiOutlineCalculator,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineClipboard,
  HiOutlineClock,
  HiOutlineCloud,
  HiOutlineExclamationCircle,
} from 'react-icons/hi2';

export function RenderTool({ tool }: { tool: ChatAIMessageToolCall<AgentTools<AgentType>> }) {
  switch (tool.name) {
    case 'calculator':
      return (
        <ToolCallWrapper tool={tool} title="Calculator">
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
              <ToolResultWrapper icon={<HiOutlineExclamationCircle size={24} className="text-red-400" />}>
                <span>{tool.result.error}</span>
              </ToolResultWrapper>
            ) : (
              <ToolResultWrapper
                icon={<HiOutlineCalculator size={24} className="text-blue-400" />}
                subtitle="Result"
                title={String(tool.result.result)}
              />
            ))}
        </ToolCallWrapper>
      );

    case 'weather':
      return (
        <ToolCallWrapper tool={tool} title="Weather">
          <div className="flex gap-2">
            <span className="font-semibold">City:</span>
            <span>{tool.args?.city}</span>
          </div>
          {tool.progressStatus?.status && (
            <div className="mt-1 text-sm text-muted-foreground">{tool.progressStatus.status}</div>
          )}
          {tool.result && (
            <ToolResultWrapper icon={<HiOutlineCloud size={24} className="text-cyan-400" />}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-sm text-muted-foreground">Temperature</div>
                  <div className="text-lg font-semibold">{tool.result.temp}°C</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Condition</div>
                  <div className="text-lg font-semibold capitalize">{tool.result.condition}</div>
                </div>
              </div>
            </ToolResultWrapper>
          )}
        </ToolCallWrapper>
      );

    case 'todos':
      return (
        <ToolCallWrapper tool={tool} title="Todo List">
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
            <ToolResultWrapper icon={<HiOutlineClipboard size={24} className="text-purple-400" />}>
              <div className="mb-2 text-sm text-muted-foreground">
                Last action: <span className="font-medium capitalize">{tool.result.action}</span>
              </div>
              {tool.result.todos.length === 0 ? (
                <div className="text-muted-foreground italic">No todos</div>
              ) : (
                <ul className="space-y-1">
                  {tool.result.todos.map((todo, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-xs">
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
        <ToolCallWrapper tool={tool} title="Timer">
          <div className="flex gap-2">
            <span className="font-semibold">Duration:</span>
            <span>{tool.args?.seconds} seconds</span>
          </div>
          {tool.state !== 'complete' && tool.progressStatus && (
            <div className="mt-1">
              <div className="flex items-center gap-2">
                <Progress value={tool.progressStatus.progress} className="flex-grow" />
                <span className="text-sm text-muted-foreground">{tool.progressStatus.message}</span>
              </div>
            </div>
          )}
          {tool.result && (
            <ToolResultWrapper
              icon={<HiOutlineClock size={24} className="text-amber-400" />}
              subtitle="Duration"
              title={`${tool.result.duration} seconds`}
            />
          )}
        </ToolCallWrapper>
      );

    case 'prompt-user':
      return (
        <ToolCallWrapper tool={tool} title="User Input">
          {tool.callbacks.map((callback) => (
            <ToolResultWrapper
              key={callback.callbackId}
              icon={<HiOutlineChatBubbleOvalLeft size={24} className="text-green-400" />}
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
          {tool.result && (
            <ToolResultWrapper
              icon={<HiOutlineChatBubbleOvalLeft size={24} className="text-green-400" />}
              subtitle="User Input"
              title={tool.result.response}
            />
          )}
        </ToolCallWrapper>
      );

    default:
      return (
        <ToolCallWrapper tool={tool} title="Unknown Tool">
          <div className="text-muted-foreground">Unknown tool: {(tool as any).name}</div>
        </ToolCallWrapper>
      );
  }
}

function PromptUserInput({ onSubmit }: { onSubmit: (response: string) => void }) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSubmit(input.trim());
      setInput('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent border-0 p-0 focus-visible:ring-0"
            placeholder="Type your response..."
          />
          <Button type="submit" size="sm" disabled={!input.trim()}>
            Submit
          </Button>
        </div>
      </Card>
    </form>
  );
}
