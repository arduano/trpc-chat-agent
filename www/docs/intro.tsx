import { MockChat } from '@site/src/components/chat/MockChat';
import { ToolCallWrapper } from '@site/src/components/chat/ToolCallWrapper';
import { ToolResultWrapper } from '@site/src/components/chat/ToolResultWrapper';
import { initAgents, MockAgentBackend } from '@trpc-chat-agent/core';
import { HiOutlineCalculator } from 'react-icons/hi';
import { z } from 'zod';

const responseMessage1 = `
# 👋 Welcome to tRPC Chat Agent!

I'm an hardcoded "AI" assistant that showcases the power of this framework. Here's what I can do:

- Real-time message processing
- Type-safe interactions
- Tool execution with live updates
- User-interactive callbacks
- Framework-agnostic design

## 🚀 Let's explore how it works...

### Automatic Response Streaming ⚡
The framework processes message update streaming using an optimized state management system. Responses appear *progressively* with tool calls in between, like you'd expect from any AI chat platform.

### Type Safety 🔒
Every interaction is **fully type-safe**, from user inputs to AI responses. This means fewer errors and a more reliable chat experience. The framework ensures that all data flowing through conversations maintains its integrity.

### Tool Execution 🛠️
The framework can execute various tools and commands while keeping users updated on their progress. Here's a quick example:
`.trim();

const responseMessage2 = `
### Framework Flexibility 🔌
Thanks to its framework-agnostic design, tRPC Chat Agent adapts to any environment. Whether your project uses \`React\`, \`Next.js\`, or another framework, it works seamlessly with your setup.

### Interactive Callbacks 💬
When additional information is needed during a task, the framework can *pause execution* and request user input, making interactions truly **dynamic** and **collaborative**.

---

## Ready to dive in?
Let's explore these capabilities together - what would you like to try first?
`.trim();

const ai = initAgents.backend(new MockAgentBackend()).create();
const agent = ai.agent({
  tools: [
    ai.tool({
      name: 'greet',
      description: 'Greet the user',
      schema: z.object({
        name: z.string(),
      }),
      run: async ({ input }) => {
        const response = `Hello, ${input.name}!`;
        return {
          response,
          clientResult: { result: response },
        };
      },
      mapArgsForClient: (args) => args,
    }),
  ],
  generateResponseUpdates: async ({ create }) => {
    await create.beginMessagePart(0);
    await create.aiMessagePartContent(responseMessage1, 20);

    await create.aiToolCalls(
      create.toolCallSchema({
        toolName: 'greet',
        finalArgs: { name: 'World' },
      })
    );

    await create.beginMessagePart(0);
    await create.aiMessagePartContent(responseMessage2, 20);
  },
});

export function HumanMessageComponent() {
  return (
    <MockChat
      agent={agent}
      renderToolCall={{
        greet: (tool) => (
          <ToolCallWrapper tool={tool} title="Greet">
            <div className="flex gap-2">
              <span className="font-semibold">Name:</span>
              <span>{tool.args?.name}</span>
            </div>
            <ToolResultWrapper
              icon={<HiOutlineCalculator size={24} className="text-blue-400" />}
              subtitle="Result"
              title={String(tool.result.result)}
            />
          </ToolCallWrapper>
        ),
      }}
      seedPrompt="Hi! Who are you?"
    />
  );
}
