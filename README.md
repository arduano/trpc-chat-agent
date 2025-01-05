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
// Server-side tool definition
const myTool = createTool({
  // Schema for what the AI sees
  aiSchema: z.object({
    query: z.string(),
  }),
  // Schema for what the client sees (can be partial/different)
  clientSchema: z.object({
    partialQuery: z.string(),
  }),
  // Optional progress updates
  progressSchema: z.object({
    status: z.string(),
    percent: z.number(),
  }),
  // Execute the tool
  async execute(args, ctx) {
    // Send progress updates
    ctx.progress({ status: 'Searching...', percent: 50 });

    // Can request client input mid-execution
    const confirmation = await ctx.callback('confirm', {
      message: 'Proceed with action?',
    });

    return {
      // Response for the AI
      ai: { result: '...' },
      // Response for the client
      client: { partialResult: '...' },
    };
  },
});
```

## Contributing

Contributions are welcome! This project is currently in beta, preparing for its first release.

## License

MIT
