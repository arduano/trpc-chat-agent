import { StructuredChatTool } from '@arduano/trpc-langchain-agent/common';
import { createAdvancedReactAgent } from '@arduano/trpc-langchain-agent/server';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

// Simple in-memory store for todo items
const todos: string[] = [];

const calculatorTool = new StructuredChatTool({
  name: 'calculator',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  description: 'Perform basic math operations',
  run: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add':
        return { result: a + b };
      case 'subtract':
        return { result: a - b };
      case 'multiply':
        return { result: a * b };
      case 'divide':
        return b === 0 ? { error: 'Cannot divide by zero' } : { result: a / b };
    }
  },
  mapArgsForClient: (args) => args,
  mapResultForClient: (result) => result,
  mapResultForAI: (result) =>
    'error' in result ? (result.error ?? 'An error occurred') : `The result is ${result.result}`,
});

const weatherTool = new StructuredChatTool({
  name: 'weather',
  schema: z.object({
    city: z.string(),
  }),
  toolProgressSchema: z.object({
    status: z.string(),
  }),
  description: 'Get mock weather data for a city',
  run: async ({ city }, manager, config) => {
    const cities: Record<string, { temp: number; condition: string }> = {
      'new york': { temp: 20, condition: 'sunny' },
      london: { temp: 15, condition: 'rainy' },
      tokyo: { temp: 25, condition: 'cloudy' },
    };

    config?.sendProgress({ status: 'Fetching weather data...' });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const weather = cities[city.toLowerCase()] ?? { temp: 22, condition: 'unknown' };
    return weather;
  },
  mapArgsForClient: (args) => args,
  mapResultForClient: (result) => result,
  mapResultForAI: (result) => `The temperature is ${result.temp}°C and it's ${result.condition}`,
});

const todoTool = new StructuredChatTool({
  name: 'todos',
  schema: z.object({
    action: z.enum(['add', 'list', 'clear']),
    task: z.string().optional(),
  }),
  description: 'Manage a todo list',
  run: async ({ action, task }) => {
    switch (action) {
      case 'add':
        if (task) {
          todos.push(task);
        }
        return { todos, action: 'added' } as const;
      case 'list':
        return { todos, action: 'listed' } as const;
      case 'clear':
        todos.length = 0;
        return { todos, action: 'cleared' } as const;
      default:
        throw new Error('Invalid action');
    }
  },
  mapArgsForClient: (args) => args,
  mapResultForClient: (result) => result,
  mapResultForAI: (result) => `Todos ${result.action}. Current list: ${result.todos.join(', ') || 'empty'}`,
});

const timerTool = new StructuredChatTool({
  name: 'timer',
  schema: z.object({
    seconds: z.number().min(1).max(10),
  }),
  toolProgressSchema: z.object({
    progress: z.number(),
    message: z.string(),
  }),
  description: 'Start a timer with progress updates',
  run: async ({ seconds }, manager, config) => {
    const startTime = Date.now();
    const endTime = startTime + seconds * 1000;

    while (Date.now() < endTime) {
      const progress = ((Date.now() - startTime) / (seconds * 1000)) * 100;
      config?.sendProgress({
        progress: Math.min(progress, 100),
        message: `Timer running... ${Math.round(progress)}%`,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return { completed: true, duration: seconds };
  },
  mapArgsForClient: (args) => args,
  mapResultForClient: (result) => result,
  mapResultForAI: (result) => `Timer completed after ${result.duration} seconds`,
});

const allTools = [calculatorTool, weatherTool, todoTool, timerTool] as const;

export const agent = createAdvancedReactAgent({
  llm: new ChatOpenAI({ model: 'gpt-4o' }),
  tools: allTools,
  debounceMs: 0,
});

export type AgentType = typeof agent;
