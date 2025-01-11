import type { ChatAIMessageToolCall, GetToolByName } from '@trpc-chat-agent/core';
import Link from '@docusaurus/Link';
import { cn } from '@site/src/lib/utils';
import { initAgents, MockAgentBackend } from '@trpc-chat-agent/core';
import { useEffect, useState } from 'react';
import { HiCheck, HiOutlineCode, HiOutlineDocument } from 'react-icons/hi';
import { LuBrainCircuit } from 'react-icons/lu';
import { z } from 'zod';
import { MockChat } from '../chat/MockChat';
import { StyledMarkdown } from '../chat/StyledMarkdown';
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

I'm an hardcoded "AI" assistant that showcases the power of this framework. Here's what the library can do:

- Streamed message responses
- Type-safe interactions
- Conversation branching built-in
- Tool execution with live updates
- User-interactive callbacks
- Framework-agnostic design

**This chat is using the library with a virtual client+server tRPC layer in your browser. You can even regenerate this message or edit the user message!**

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
Thanks to its framework-agnostic design, tRPC Chat Agent adapts to any environment. Adapters exist for \`React\` and \`LangChain\`, as well as a \`"Mock LLM"\` adapter that this chat is currently using!

### Interactive Callbacks 💬
When additional information is needed during a task, the framework can *pause execution* during a tool call and request user input, making interactions truly **dynamic** and **collaborative**.
`.trim();

const responseMessage3 = `
---

## Ready to dive in?
Let's explore these capabilities together
`.trim();

const responseMessageNonDefault = `
Notice how the user message now has a counter above it? The library supports branching conversations so you can switch to previous branches. This is all handled automatically for you!
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
      name: 'analyzeSite',
      description: 'Analyze a website',
      schema: z.object({
        url: z.string(),
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
            result: 'Please star the github repo!',
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
    ai.tool({
      name: 'callbackDemo',
      description: 'Callback demo',
      schema: z.object({}),
      callbacks: {
        getResponse: ai.callback({
          args: z.object({ options: z.array(z.string()), question: z.string() }),
          response: z.object({ response: z.string() }),
        }),
      },
      run: async ({ callbacks }) => {
        const response = await callbacks.getResponse({
          question: 'Which LLM will you use for your next project?',
          options: ['Claude', 'GPT', 'o1', 'Llama', 'Other'],
        });
        if (!response) {
          return {
            clientResult: null,
            response: '',
          };
        }

        return {
          clientResult: {
            response: response.response,
          },
          response: response.response,
        };
      },
      mapArgsForClient: (args) => args,
    }),
    ai.tool({
      name: 'gettingStartedButton',
      description: 'Getting started button',
      schema: z.object({}),
      run: async () => {
        return {
          clientResult: {},
          response: '',
        };
      },
      mapArgsForClient: (args) => args,
    }),
  ],
  generateResponseUpdates: async ({ create, lastUserMessage }) => {
    const lastUserMessageNormalized = lastUserMessage.replace(/\W+/g, '').toLowerCase();
    const shouldGiveDemoMessage = lastUserMessageNormalized === 'hiwhoareyou';

    if (!shouldGiveDemoMessage) {
      await create.beginMessagePart(0);
      await create.aiMessagePartContent(responseMessageNonDefault, 20);
    } else {
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
            .map((content) => ({ file: 'src/demo-file-writing.ts', content })),
          argsProgressDelay: 5,
          finalArgs: {
            file: 'src/demo-file-writing.ts',
            content: exampleAgentCode,
          },
        })
      );

      await create.beginMessagePart(0);

      await create.aiToolCalls(
        create.toolCallSchema({
          toolName: 'analyzeSite',
          finalArgs: { url: 'https://github.com/arduano/trpc-chat-agent' },
        })
      );

      await create.beginMessagePart(0);

      await create.aiMessagePartContent(responseMessage2, 20);

      const [response] = await create.aiToolCalls(
        create.toolCallSchema({
          toolName: 'callbackDemo',
          finalArgs: {},
        })
      );

      await create.beginMessagePart(0);
      const responseStr = `The tool call can see your response was \`${response.response}\`! The response can be forwarded to the LLM too.`;
      await create.aiMessagePartContent(`${responseStr}\n\n${responseMessage3}`, 20);
      await create.aiToolCalls(
        create.toolCallSchema({
          toolName: 'gettingStartedButton',
          finalArgs: {},
        })
      );
    }
  },
});

export function HomePageChat({ shouldBegin }: { shouldBegin: boolean }) {
  return (
    <MockChat
      agent={agent}
      shouldBegin={shouldBegin}
      renderToolCall={{
        greet: (tool) => (
          <ToolCallWrapper tool={tool} title="Greet">
            <div className="flex gap-2">
              <span className="font-semibold">Name:</span>
              <span>{tool.args?.name}</span>
            </div>
            <ToolResultWrapper
              icon={<HiCheck size={24} className="text-blue-400" />}
              subtitle="Result"
              title={String(tool.result?.result)}
            />
          </ToolCallWrapper>
        ),
        analyzeSite: (tool) => {
          const progress = tool.progressStatus?.progress ?? (tool.result ? 1 : 0);
          return (
            <ToolCallWrapper tool={tool} title="Code Analysis">
              <div className="flex gap-2">
                <span className="font-semibold">URL:</span>
                <span>{tool.args?.url}</span>
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
        callbackDemo: (tool) => (
          <ToolCallWrapper tool={tool} title="Callback Demo">
            {tool.callbacks.map((callback) => (
              <ToolResultWrapper
                key={callback.callbackId}
                icon={<LuBrainCircuit size={24} className="text-green-400" />}
                subtitle="Choose an Option"
                title={callback.args.question}
              >
                <div className="mt-4 flex flex-wrap gap-2">
                  {callback.args.options.map((option) => (
                    <Button
                      key={option}
                      onClick={() => callback.respond({ response: option })}
                      variant="outline"
                      size="sm"
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              </ToolResultWrapper>
            ))}
            {tool.result && (
              <ToolResultWrapper
                icon={<LuBrainCircuit size={24} className="text-green-400" />}
                subtitle="Selected Option"
                title={tool.result.response}
              />
            )}
          </ToolCallWrapper>
        ),
        gettingStartedButton: (tool) => (
          <ToolCallWrapper tool={tool} title="Show Button">
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/docs/intro">
                <Button variant="default" size="sm" className="cursor-pointer">
                  Getting Started
                </Button>
              </Link>
            </div>
          </ToolCallWrapper>
        ),
      }}
      seedPrompt="Hi! Who are you?"
    />
  );
}

type WriteCodeFileToolProps = {
  tool: ChatAIMessageToolCall<GetToolByName<'writeCodeFile', typeof agent>>;
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
          <ScrollArea className={cn('w-full text-sm', isCollapsed ? 'max-h-[100px]' : '')}>
            {!tool.result ? (
              <pre>
                <code>{tool.args?.content}</code>
              </pre>
            ) : (
              // Yes I know this is lazy
              <StyledMarkdown>{`\`\`\`ts\n${tool.args?.content}\n\`\`\``}</StyledMarkdown>
            )}
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
