import type { ChatToolCall, GetToolByName } from '@trpc-chat-agent/core';
import { cn } from '@site/src/lib/utils';
import { initAgents, MockAgentBackend } from '@trpc-chat-agent/core';
import { useEffect, useState } from 'react';
import { HiOutlineCalculator, HiOutlineCode, HiOutlineDocument } from 'react-icons/hi';
import { z } from 'zod';
import { MockChat } from '../chat/MockChat';
import { ToolCallWrapper } from '../chat/ToolCallWrapper';
import { ToolResultWrapper } from '../chat/ToolResultWrapper';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { ScrollArea } from '../ui/scroll-area';

const exampleAgentCode = `import { initAgents, MockAgentBackend } from '@trpc-chat-agent/core';
import { z } from 'zod';

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
        const response = \`Hello, \${input.name}!\`;
        return {
          response,
          clientResult: { result: response },
        };
      },
      mapArgsForClient: (args) => args,
    }),
    ai.tool({
      name: 'calculator',
      description: 'Perform basic math operations',
      schema: z.object({
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
        a: z.number(),
        b: z.number(),
      }),
      run: async ({ input: { operation, a, b } }) => {
        let result;
        switch (operation) {
          case 'add':
            result = a + b;
            break;
          case 'subtract':
            result = a - b;
            break;
          case 'multiply':
            result = a * b;
            break;
          case 'divide':
            result = b === 0 ? undefined : a / b;
            break;
        }
        return {
          response: \`Result: \${result}\`,
          clientResult: { result },
        };
      },
      mapArgsForClient: (args) => args,
    }),
  ],
});

export default agent;`.trim();

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
    ai.tool({
      name: 'analyzeCode',
      description: 'Analyze code',
      schema: z.object({
        file: z.string(),
      }),
      toolProgressSchema: z.object({
        progress: z.number(),
      }),
      run: async ({ sendProgress }) => {
        for (let i = 0; i <= 100; i++) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          sendProgress({ progress: i / 100 });
        }

        return {
          response: '',
          clientResult: {
            result: 'This a demo of progress updates from tRPC Chat Agent',
          },
        };
      },
      mapArgsForClient: (args) => args,
    }),
    ai.tool({
      name: 'writeCodeFile',
      description: 'Write code file',
      schema: z.object({
        file: z.string(),
        content: z.string(),
      }),
      run: async () => {
        return {
          clientResult: true,
          response: '',
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

    await create.aiToolCalls(
      create.toolCallSchema({
        toolName: 'writeCodeFile',
        inProgressArgs: create
          .mockCumulativeTokensList(exampleAgentCode)
          .map((content) => ({ file: 'src/agent.ts', content })),
        argsProgressDelay: 5,
        finalArgs: {
          file: 'src/agent.ts',
          content: exampleAgentCode,
        },
      })
    );

    await create.beginMessagePart(0);
    await create.aiToolCalls(
      create.toolCallSchema({
        toolName: 'analyzeCode',
        finalArgs: { file: 'src/agent.ts' },
      })
    );
    await create.beginMessagePart(0);

    await create.aiMessagePartContent(responseMessage2, 20);
  },
});

export function HomePageChat() {
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
              title={String(tool.result?.result)}
            />
          </ToolCallWrapper>
        ),
        analyzeCode: (tool) => {
          const progress = tool.progressStatus?.progress ?? (tool.result ? 1 : 0);
          return (
            <ToolCallWrapper tool={tool} title="Code Analysis">
              <div className="flex gap-2">
                <span className="font-semibold">File:</span>
                <span>{tool.args?.file}</span>
              </div>
              <div className="mt-2">
                <Progress value={progress * 100} className="h-2" />
                <div className="mt-1 text-sm text-muted-foreground">Analyzing... {Math.round(progress * 100)}%</div>
              </div>
              {tool.result && (
                <ToolResultWrapper
                  icon={<HiOutlineCode size={24} className="text-blue-400" />}
                  subtitle="Analysis Result"
                  title={String(tool.result.result)}
                />
              )}
            </ToolCallWrapper>
          );
        },
        writeCodeFile: (tool) => <WriteCodeFileTool tool={tool} />,
      }}
      seedPrompt="Hi! Who are you?"
    />
  );
}

type WriteCodeFileToolProps = {
  tool: ChatToolCall<GetToolByName<'writeCodeFile', typeof agent>>;
};

function WriteCodeFileTool({ tool }: WriteCodeFileToolProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (tool.result) {
      setIsCollapsed(true);
    }
  }, [tool.result]);

  return (
    <ToolCallWrapper tool={tool} title="Code File">
      <div className="flex gap-2">
        <span className="font-semibold">File:</span>
        <span>{tool.args?.file}</span>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HiOutlineDocument size={20} className="text-blue-400" />
            Code Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className={cn('w-full', isCollapsed ? 'max-h-[100px]' : '')}>
            <pre className="text-sm">
              <code>{tool.args?.content}</code>
            </pre>
          </ScrollArea>
          {tool.args?.content && tool.args.content.split('\n').length > 15 && (
            <Button onClick={() => setIsCollapsed(!isCollapsed)} className="mt-2">
              {isCollapsed ? 'Show Full' : 'Collapse'}
            </Button>
          )}
        </CardContent>
      </Card>
    </ToolCallWrapper>
  );
}
