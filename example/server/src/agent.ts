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
  run: async ({ input: { operation, a, b } }) => {
    let response;
    switch (operation) {
      case 'add':
        response = { result: a + b };
        break;
      case 'subtract':
        response = { result: a - b };
        break;
      case 'multiply':
        response = { result: a * b };
        break;
      case 'divide':
        response = b === 0 ? { error: 'Cannot divide by zero' } : { result: a / b };
        break;
      default:
        throw new Error('Invalid operation');
    }

    return {
      response: JSON.stringify(response, null, 2),
      clientResult: response,
    };
  },
  mapArgsForClient: (args) => args,
  mapErrorForAI: (error) => `An error occurred: ${error}`,
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
  run: async ({ input: { city }, sendProgress }) => {
    const cities: Record<string, { temp: number; condition: string }> = {
      'new york': { temp: 20, condition: 'sunny' },
      london: { temp: 15, condition: 'rainy' },
      tokyo: { temp: 25, condition: 'cloudy' },
    };

    sendProgress({ status: 'Fetching weather data...' });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const response = cities[city.toLowerCase()] ?? { temp: 22, condition: 'unknown' };
    return {
      response: JSON.stringify(response, null, 2),
      clientResult: response,
    };
  },
  mapArgsForClient: (args) => args,
  mapErrorForAI: (error) => `Failed to get weather data: ${error}`,
});

const todoTool = new StructuredChatTool({
  name: 'todos',
  schema: z.object({
    action: z.enum(['add', 'list', 'clear']),
    task: z.string().optional(),
  }),
  description: 'Manage a todo list',
  run: async ({ input: { action, task } }) => {
    let response;
    switch (action) {
      case 'add':
        if (task) {
          todos.push(task);
        }
        response = { todos, action: 'added' } as const;
        break;
      case 'list':
        response = { todos, action: 'listed' } as const;
        break;
      case 'clear':
        todos.length = 0;
        response = { todos, action: 'cleared' } as const;
        break;
      default:
        throw new Error('Invalid action');
    }

    return {
      response: JSON.stringify(response, null, 2),
      clientResult: response,
    };
  },
  mapArgsForClient: (args) => args,
  mapErrorForAI: (error) => `Todo operation failed: ${error}`,
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
  run: async ({ input: { seconds }, sendProgress }) => {
    const startTime = Date.now();
    const endTime = startTime + seconds * 1000;

    while (Date.now() < endTime) {
      const progress = ((Date.now() - startTime) / (seconds * 1000)) * 100;
      sendProgress({
        progress: Math.min(progress, 100),
        message: `Timer running... ${Math.round(progress)}%`,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const response = { completed: true, duration: seconds };
    return {
      response: JSON.stringify(response, null, 2),
      clientResult: response,
    };
  },
  mapArgsForClient: (args) => args,
  mapErrorForAI: (error) => `Timer failed: ${error}`,
});

const allTools = [calculatorTool, weatherTool, todoTool, timerTool] as const;

export const agent = createAdvancedReactAgent({
  llm: new ChatOpenAI({ model: 'gpt-4o' }),
  tools: allTools,
  debounceMs: 0,
});

export type AgentType = typeof agent;
