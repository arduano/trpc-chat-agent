# @trpc-chat-agent

A powerful, type-safe framework for building AI chat agents with tRPC. Seamlessly integrate LLM-powered chat capabilities into your application with end-to-end type safety and real-time updates.

> ⚠️ This project is currently in beta and preparing for its first npm release.

> ⚠️ The project depends on tRPC v11 Beta. This is necessary to allow SSE-based subscriptions in NextJS, avoiding websockets entirely.

## Features

- 🔐 **100% End-to-End Type Safety** - Every exposed API that allows custom types propagates them end-to-end, including to the frontend
- 🔄 **Built on top of tRPC primitives** - All data is managed through tRPC subscriptions and queries, you can run this anywhere tRPC runs!
- 🎯 **Framework Agnostic** - Adapters can be written for any LLM backend or frontend framework. Currently supports Langchain and React
- ⚛️ **Optimized state management** - Client-side state is managed through signals and avoids redundant re-instancing of identical data.
- 🛠️ **Advanced Tool Calls** - First-class support for AI tool calls with:
  - Split client/server argument schemas, allowing the client to preview partial arguments
  - Optional real-time tool progress updates
  - Interactive callbacks, allowing a tool to request user input
  - Structured response types, with LLM/client response variants

## Packages

- `@trpc-chat-agent/core` - Core library with base functionality
- `@trpc-chat-agent/react` - React integration with hooks and optimized components
- `@trpc-chat-agent/langchain` - LangChain adapter for easy LLM integration

## Quick Start

```bash
# Installation (coming soon)
npm install @trpc-chat-agent/core
# Optional adapters
npm install @trpc-chat-agent/react    # For React
npm install @trpc-chat-agent/langchain # For LangChain
```

Check out the [demo](./demo) directory for a complete Next.js reference implementation.

## Tool Calls

One of the most powerful features is the type-safe tool call system:

```typescript
import { initAgents, LangChainBackend } from '@trpc-chat-agent/core';
import { z } from 'zod';

const ai = initAgents.backend(new LangChainBackend()).create();

const agent = ai.agent({
  tools: [
    ai.tool({
      // Names are enforced at the type level
      name: 'greet',
      description: 'Greet the user',
      // Schemas are propagated end-to-end
      schema: z.object({
        name: z.string(),
      }),
      // (optional) Progress schema for sending progress updates
      progressSchema: z.object({
        progressPercent: z.number(),
      }),
      // (optional) Tool callbacks for interactive user input
      callbacks: {
        pickOption: ai.callback({
          args: z.object({
            question: z.string(),
            options: z.array(z.string()),
          }),
          response: z.object({
            option: z.string(),
          }),
        }),
      },
      run: async ({ input, progress, callbackInvoker }) => {
        // Show progress updates
        await progress.update({ progressPercent: 0 });

        // Example of using callbacks to get user input
        const { option } = await callbackInvoker.pickOption({
          question: `Which language would you like to greet ${input.name} in?`,
          options: ['English', 'Spanish', 'Japanese'],
        });

        await progress.update({ progressPercent: 50 });

        // Small delay to simulate work
        await progress.update({ progressPercent: 100 });

        const greetings = {
          English: 'Hello',
          Spanish: 'Hola',
          Japanese: 'こんにちは'
        };
        const response = `${greetings[option]}, ${input.name}!`;

        return {
          response,
          clientResult: { result: response },
        };
      },
      mapArgsForClient: (args) => args,
    }),
  ],
});
```

## Contributing

Contributions are welcome! This project is currently in beta, preparing for its first release.

## License

MIT
