import type { createContext } from './context';
import { initAgents } from '@trpc-chat-agent/core';
import { langchainBackend, models } from '@trpc-chat-agent/langchain';
import { z } from 'zod';

export const ai = initAgents.context<typeof createContext>().backend(langchainBackend).create();

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
  run: async ({ input: { action, task }, ctx, conversationId }) => {
    const response = await ctx.todosLock.acquire(conversationId, async () => {
      const todos = ((await ctx.todos.get(conversationId)) as string[]) ?? [];
      switch (action) {
        case 'add':
          if (task) {
            todos.push(task);
          }
          await ctx.todos.set(conversationId, todos);
          return { todos, action: 'added' } as const;
        case 'clear':
          todos.length = 0;
          await ctx.todos.set(conversationId, todos);
          return { todos, action: 'cleared' } as const;
        case 'list':
          return { todos, action: 'listed' } as const;
        default:
          throw new Error('Invalid action');
      }
    });

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
      args: z.object({
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

export const agent = ai.agent({
  // llm: new ChatOpenAI({ model: 'o3-mini' }),
  // llm: models.openai({ model: 'o3-mini' }),
  llm: models.openai({ model: 'gpt-4.1' }),
  // llm: models.anthropic({
  //   model: 'claude-3-7-sonnet-20250219',
  //   thinking: { type: 'enabled', budget_tokens: 4000 },
  //   maxTokens: 8000,
  // }),
  tools: allTools,
  transformInvocation: (args) => {
    return args;
  },
});

export type AgentType = typeof agent;
