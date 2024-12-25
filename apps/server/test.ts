import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  BaseMessageChunk,
  HumanMessage,
  HumanMessageChunk,
  isAIMessage,
  isAIMessageChunk,
  MessageContentComplex,
} from "@langchain/core/messages";
import {
  JsonOutputParser,
  parsePartialJson,
} from "@langchain/core/output_parsers";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z, ZodSchema, ZodType } from "zod";
import { parseStringPromise } from "xml2js";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { RunnableConfig, RunnableLambda } from "@langchain/core/runnables";
import {
  StateGraph,
  MessagesAnnotation,
  LangGraphRunnableConfig,
  END,
  START,
} from "@langchain/langgraph";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { ToolCall } from "@langchain/core/messages/tool";
import { Debouncer } from "./src/debounce";
import { StructuredChatTool, AnyStructuredChatTool } from "./tool";

const json = new JsonOutputParser();

// const result = await json.parsePartialResult([
//   {
//     text: '{ "foo": "ba',
//   },
//   {
//     text: '{ "asdf": 1 }',
//   },
// ]);

const result = await parsePartialJson('{ "foo": "ba');

const tool = new StructuredChatTool({
  name: "greet",
  schema: z.object({
    name: z.string(),
  }),
  toolProgressSchema: z.object({
    message: z.string(),
  }),
  description: "Greet the user",
  run: async ({ name }) => {
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
});

const tool2 = new StructuredChatTool({
  name: "greet2",
  schema: z.object({
    name: z.string(),
    formal: z.boolean(),
  }),
  toolProgressSchema: z.object({
    message: z.string(),
  }),
  description: "Greet the user",
  run: async ({ name, formal }) => {
    const greeting = formal ? "Hello" : "Hi";
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
});

const allTools = [tool, tool2] as const;

export interface AgentState {
  messages: BaseMessage[];
}

export function createAdvancedReactAgent<
  const Tools extends readonly AnyStructuredChatTool[]
>(args: { llm: BaseChatModel; tools: Tools; debounceMs: number }) {
  const { llm, tools, debounceMs } = args;
  const toolsList = tools as any as AnyStructuredChatTool[]; // Remove "readonly"

  if (!("bindTools" in llm) || typeof llm.bindTools !== "function") {
    throw new Error(`llm ${llm} must define bindTools method.`);
  }
  const modelWithTools = llm.bindTools(toolsList);

  const stateModifierRunnable = RunnableLambda.from(
    (state: typeof MessagesAnnotation.State) => state.messages
  ).withConfig({ runName: "state_modifier" });

  const modelRunnable = stateModifierRunnable.pipe(modelWithTools);

  const shouldContinue = (state: AgentState) => {
    return END;

    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (
      isAIMessage(lastMessage) &&
      (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0)
    ) {
      return END;
    } else {
      return "continue";
    }
  };

  const callModel = async (state: AgentState, config: RunnableConfig) => {
    const stream = await modelRunnable.streamEvents(state, {
      ...config,
      version: "v2",
    });

    let finalAiMessageData: AIMessage;
    let aggregateChunk: AIMessageChunk | undefined;
    let currentToolId: string | undefined;

    let allDebouncers: Debouncer<any>[] = [];
    let currentToolClientPreview: Debouncer<any> | null = null;

    for await (const chunk of stream) {
      if (chunk.event === "on_chat_model_stream") {
        const data = chunk.data.chunk;
        if (isAIMessageChunk(data)) {
          if (!aggregateChunk) {
            aggregateChunk = data;
          } else {
            aggregateChunk = aggregateChunk.concat(data);
          }

          const toolId = data.tool_call_chunks?.[0]?.id;
          if (toolId && toolId !== currentToolId) {
            const name = aggregateChunk.tool_calls?.[0]?.name!;
            const tool = toolsList.find((t) => t.name === name);

            if (tool) {
              currentToolId = toolId;
              currentToolClientPreview = tool.makeDebouncedArgsMapper(
                debounceMs,
                (args) => {
                  console.log("Sending args for tool:", args);
                }
              );
              allDebouncers.push(currentToolClientPreview!);
            }
          }

          if (currentToolClientPreview && currentToolId) {
            const toolCall = aggregateChunk.tool_call_chunks?.find(
              (c) => c.id === currentToolId
            );

            if (toolCall?.args) {
              try {
                const json = parsePartialJson(toolCall.args);
                if (json) {
                  currentToolClientPreview?.debounce(json);
                }
              } catch (e) {
                console.error("Error parsing tool args:", e);
              }
            }
          }
        }
      }

      if (chunk.event === "on_chat_model_end") {
        const data = chunk.data.output;
        if (isAIMessageChunk(data)) {
          finalAiMessageData = data;
          aggregateChunk = data;
          console.log(data);
        }
      }
    }

    // Flush all debouncers
    allDebouncers.forEach((d) => d.flush());

    // // TODO: Auto-promote streaming.
    // return { messages: [await modelRunnable.invoke(state, config)] };
  };

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", new ToolNode(toolsList))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, {
      continue: "tools",
      [END]: END,
    })
    .addEdge("tools", "agent");

  return workflow.compile({});
}

const agent = createAdvancedReactAgent({
  llm: new ChatOpenAI({
    modelName: "gpt-4o",
  }),
  tools: [tool],
  debounceMs: 100,
});

const response = await agent.invoke(
  {
    messages: [
      new HumanMessage(
        "Try calling the greet function with an arbitrary 8 word long string for testing, I want to make sure it works."
      ),
    ],
  },
  {}
);

console.log(response.messages);
