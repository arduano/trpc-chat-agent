import { createAdvancedReactAgent } from '@arduano/trpc-langchain-agent/server';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { ai } from './context';

// Simple in-memory store for todo items
const todos: string[] = [];

const calculatorTool = ai.tool({
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

const weatherTool = ai.tool({
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

const todoTool = ai.tool({
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

const timerTool = ai.tool({
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

const toolWithCallback = ai.tool({
  name: 'prompt-user',
  schema: z.object({
    question: z.string(),
  }),
  description: 'Get the user to respond to a prompt',
  callbacks: {
    getResponse: ai.callback({
      schema: z.object({
        question: z.string(),
      }),
      response: z.object({
        response: z.string(),
      }),
    }),
  },
  run: async ({ input: { question }, callbacks }) => {
    const response = await callbacks.getResponse({ question });

    return {
      response: `User's response: ${response.response}`,
      clientResult: response,
    };
  },
  mapArgsForClient: (args) => args,
  mapErrorForAI: (error) => `Failed to get user response: ${error}`,
});

const allTools = [calculatorTool, weatherTool, todoTool, timerTool, toolWithCallback] as const;

export const agent = createAdvancedReactAgent({
  llm: new ChatOpenAI({ model: 'gpt-4o' }),
  tools: allTools,
  debounceMs: 0,
});

export type AgentType = typeof agent;
