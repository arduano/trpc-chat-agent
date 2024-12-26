import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  BaseMessageChunk,
  HumanMessage,
  HumanMessageChunk,
  isAIMessage,
  isAIMessageChunk,
  MessageContent,
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
  Annotation,
  messagesStateReducer,
  interrupt,
} from "@langchain/langgraph";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { ToolCall } from "@langchain/core/messages/tool";
import { Debouncer } from "./src/debounce";
import { StructuredChatTool, AnyStructuredChatTool } from "./tool";
import {
  AdvancedAIMessageData,
  ChatTree,
  ClientSideChatConversation,
  ClientSideConversationUpdate,
  ClientSideUpdate,
  HumanMessageData,
  ServerSideChatConversation,
  ServerSideConversationData,
  ServerSideConversationUpdate,
  ServerSideUpdate,
  ServerUpdateBeginToolCall,
} from "./types";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { useConversationStore } from "./clientConversationStore";
import { createAdvancedReactAgent } from "./advancedReactAgent";

const tool = new StructuredChatTool({
  name: "greet",
  schema: z.object({
    name: z.string(),
  }),
  toolProgressSchema: z.object({
    loading: z.number(),
  }),
  description: "Greet the user",
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
  name: "greet2",
  schema: z.object({
    name: z.string(),
    formal: z.boolean(),
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
  mapResultForAI: (result) => {
    return result.greeting;
  },
});

const allTools = [tool, tool2] as const;

const controller = new AbortController();

const agent = createAdvancedReactAgent({
  llm: new ChatOpenAI({
    modelName: "gpt-4o",
  }),
  tools: allTools,
  debounceMs: 0,
});

const serverSideConversation = new ServerSideChatConversation<typeof agent>(
  ServerSideChatConversation.newConversationData("test")
);
let chatBranch: ChatTree = [];
const events = await agent.streamEvents(
  {
    humanMessageContent:
      "Try calling the greet function with an arbitrary 8 word long string for testing, I want to make sure it works.",
    conversationData: structuredClone(serverSideConversation.data),
    chatBranch,
  },
  {
    version: "v2",
    signal: controller.signal,
  }
);

try {
  for await (const event of events) {
    try {
      if (event.name === "on_conversation_client_update") {
        console.log(event);
        const eventData = event.data as ClientSideUpdate;
        useConversationStore.getState().processClientEvent(eventData);
      }
      if (event.name === "on_conversation_server_update") {
        const eventData = event.data as ServerSideUpdate;

        if (eventData.kind === "sync-conversation") {
          chatBranch = eventData.tree;
          serverSideConversation.data = eventData.conversationData;
        } else {
          serverSideConversation.processMessageUpdate(eventData);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
} catch (e) {
  console.error(e);
}

serverSideConversation.abortAllPendingToolCalls();

console.log(JSON.stringify(serverSideConversation.data, null, 2));
console.log(
  JSON.stringify(
    useConversationStore.getState().conversations[
      serverSideConversation.data.id
    ].data.aiMessages,
    null,
    2
  )
);
