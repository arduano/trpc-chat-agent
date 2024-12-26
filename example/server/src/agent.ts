import { StructuredChatTool } from '@arduano/trpc-langchain-agent/common';
import { createAdvancedReactAgent } from '@arduano/trpc-langchain-agent/server';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

const tool = new StructuredChatTool({
  name: 'greet',
  schema: z.object({
    name: z.string(),
  }),
  toolProgressSchema: z.object({
    loading: z.number(),
  }),
  description: 'Greet the user',
  run: async ({ name }, manager, config) => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 1000));

    config?.sendProgress({
      loading: 0,
    });

    await wait();

    config?.sendProgress({
      loading: 50,
    });

    await wait();

    config?.sendProgress({
      loading: 100,
    });

    return `Hello ${name}`;
  },
  mapArgsForClient: (args) => {
    return {
      name: args.name,
    };
  },
  mapResultForClient: (result) => {
    return {
      message: result,
    };
  },
  mapResultForAI: (result) => {
    return result;
  },
});

const tool2 = new StructuredChatTool({
  name: 'greet2',
  schema: z.object({
    name: z.string(),
    formal: z.boolean(),
  }),
  description: 'Greet the user',
  run: async ({ name, formal }) => {
    const greeting = formal ? 'Hello' : 'Hi';
    return {
      greeting: `${greeting} ${name}`,
      isFormal: formal,
    };
  },
  mapResultForClient: (result) => {
    return {
      greeting: result.greeting,
    };
  },
  mapArgsForClient: (args) => {
    return {
      formal: args.formal,
    };
  },
  mapResultForAI: (result) => {
    return result.greeting;
  },
});

const allTools = [tool, tool2] as const;

export const agent = createAdvancedReactAgent({
  llm: new ChatOpenAI({ model: 'gpt-4o' }),
  tools: allTools,
  debounceMs: 0,
});

export type AgentType = typeof agent;
