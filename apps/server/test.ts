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
  ChatBranch,
  ClientSideChatConversation,
  ClientSideConversationUpdate,
  ClientSideUpdate,
  HumanMessageData,
  ServerSideChatConversation,
  ServerSideConversationData,
  ServerSideConversationUpdate,
  ServerUpdateBeginToolCall,
} from "./types";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { useConversationStore } from "./clientConversationStore";

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
    const wait = new Promise((resolve) => setTimeout(resolve, 100));

    config?.sendProgress({
      loading: 0,
    });

    await wait;

    config?.sendProgress({
      loading: 50,
    });

    await wait;

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

type FinalizeConversationMessage<
  Tools extends readonly AnyStructuredChatTool[]
> = {
  conversationData: ServerSideConversationData<Tools>;
  chatBranch: ChatBranch;
};

export function createAdvancedReactAgent<
  const Tools extends readonly AnyStructuredChatTool[]
>(args: { llm: BaseChatModel; tools: Tools; debounceMs: number }) {
  const { llm, tools, debounceMs } = args;
  const toolsList = tools as any as AnyStructuredChatTool[]; // Remove "readonly"

  const StateAnnotation = Annotation.Root({
    conversationData: Annotation<ServerSideConversationData<Tools>>,
    chatBranch: Annotation<ChatBranch>,
    humanMessageContent: Annotation<MessageContent>,
  });

  type AgentState = typeof StateAnnotation.State;

  if (!("bindTools" in llm) || typeof llm.bindTools !== "function") {
    throw new Error(`llm ${llm} must define bindTools method.`);
  }
  const modelWithTools = llm.bindTools(toolsList);

  const stateModifierRunnable = RunnableLambda.from(
    (state: typeof MessagesAnnotation.State) => state.messages
  ).withConfig({ runName: "state_modifier" });

  const modelRunnable = stateModifierRunnable.pipe(modelWithTools);

  const sendClientSideUpdateToConfig = (
    update: ClientSideUpdate,
    config: RunnableConfig
  ) => {
    dispatchCustomEvent("on_conversation_update", update, config);
  };

  const handleErrors = (fn: (...args: any[]) => any) => {
    return (...args: any[]) => {
      try {
        return fn(...args);
      } catch (e) {
        console.error(e);
        interrupt({
          kind: "error",
          error: e,
        });
      }
    };
  };

  const initializeNewMessage = async (
    state: AgentState,
    config: RunnableConfig
  ): Promise<Partial<AgentState>> => {
    const stateConvo = new ServerSideChatConversation(
      structuredClone(state.conversationData)
    );

    const aiMessageId = "ai-" + stateConvo.generateId();
    const humanMessageId = "human-" + stateConvo.generateId();

    const newHumanMessage: HumanMessageData = {
      kind: "human",
      id: humanMessageId,
      content: state.humanMessageContent,
    };

    const newAIMessage: AdvancedAIMessageData<Tools> = {
      kind: "ai",
      id: aiMessageId,
      parts: [],
    };

    const newBranch = stateConvo.pushHumanAiMessagePair(
      state.chatBranch,
      newHumanMessage,
      newAIMessage
    );

    sendClientSideUpdateToConfig(
      {
        kind: "sync-conversation",
        conversationId: state.conversationData.id,
        conversationData: new ServerSideChatConversation(
          stateConvo.data
        ).asClientSideConversation(),
        tree: newBranch,
      },
      config
    );

    return {
      chatBranch: newBranch,
      conversationData: stateConvo.data,
    };
  };

  const shouldContinue = (state: AgentState) => {
    const stateConvo = new ServerSideChatConversation(state.conversationData);
    const lastMessage = stateConvo.getAIMessageAt(state.chatBranch);

    if (!lastMessage) {
      console.error("No last message, this is unexpected");
      return "end";
    }

    const lastPart = lastMessage.parts[lastMessage.parts.length - 1];
    if (!lastPart) {
      console.error("No last part, this is unexpected");
      return "end";
    }

    const toolCalls = lastPart.toolCalls;
    if (toolCalls && toolCalls.length > 0) {
      return "continue";
    } else {
      return "end";
    }
  };

  const callModel = async (state: AgentState, config: RunnableConfig) => {
    const stateConvo = new ServerSideChatConversation(
      structuredClone(state.conversationData)
    );
    const messageList = stateConvo.asLangChainMessagesArray(state.chatBranch);

    const aiMessage = stateConvo.getAIMessageAt(state.chatBranch);
    if (!aiMessage) {
      console.error("No AI message for ID, this is unexpected");
      return;
    }
    const aiMessageId = aiMessage.id;

    const stream = await modelRunnable.streamEvents(
      { messages: messageList },
      {
        ...config,
        version: "v2",
      }
    );

    let aggregateChunk: AIMessageChunk | undefined;
    let currentToolId: string | undefined;

    let allDebouncers: Debouncer<any>[] = [];
    let currentToolClientPreview: Debouncer<any> | null = null;

    const sendServerSideUpdate = (update: ServerSideConversationUpdate) => {
      stateConvo.processMessageUpdate(update);
    };

    const sendClientSideUpdate = (update: ClientSideConversationUpdate) => {
      sendClientSideUpdateToConfig(update, config);
    };

    sendServerSideUpdate({
      kind: "begin-new-ai-message-part",
      conversationId: state.conversationData.id,
      messageId: aiMessageId,
    });
    sendClientSideUpdate({
      kind: "begin-new-ai-message-part",
      conversationId: state.conversationData.id,
      messageId: aiMessageId,
    });

    for await (const chunk of stream) {
      if (chunk.event === "on_chat_model_stream") {
        const data = chunk.data.chunk;
        if (isAIMessageChunk(data)) {
          if (!aggregateChunk) {
            aggregateChunk = data;
          } else {
            aggregateChunk = aggregateChunk.concat(data);
          }

          if (data.content.length > 0) {
            sendServerSideUpdate({
              kind: "update-content",
              conversationId: state.conversationData.id,
              messageId: aiMessageId,
              contentToAppend: data.content,
            });
            sendClientSideUpdate({
              kind: "update-content",
              conversationId: state.conversationData.id,
              messageId: aiMessageId,
              contentToAppend: data.content,
            });
          }

          const toolId = data.tool_call_chunks?.[0]?.id;
          if (toolId && toolId !== currentToolId) {
            const name = aggregateChunk.tool_calls?.[0]?.name!;
            const tool = toolsList.find((t) => t.name === name);

            if (tool) {
              sendClientSideUpdate({
                kind: "begin-tool-call",
                conversationId: state.conversationData.id,
                messageId: aiMessageId,
                toolCallId: toolId,
                toolCallName: name,
              });

              currentToolId = toolId;
              currentToolClientPreview = tool.makeDebouncedArgsMapper(
                debounceMs,
                (args) => {
                  sendClientSideUpdate({
                    kind: "update-tool-call",
                    conversationId: state.conversationData.id,
                    messageId: aiMessageId,
                    toolCallId: toolId,
                    newArgs: args,
                  });
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
          aggregateChunk = data;
        }
      }
    }

    if (!aggregateChunk) {
      console.error("No aggregate chunk, this is unexpected");
      return;
    }

    // Flush all debouncers
    allDebouncers.forEach((d) => d.flush());

    // Flush tool calls with their args
    const toolCalls = aggregateChunk.tool_calls ?? [];
    await Promise.all(
      toolCalls.map(async (toolCall) => {
        const tool = toolsList.find((t) => t.name === toolCall.name)!;

        const clientSideArgs = await tool.mapArgsForClient?.(toolCall.args);

        // Make sure the args are up to date
        sendServerSideUpdate({
          kind: "begin-tool-call",
          conversationId: state.conversationData.id,
          messageId: aiMessageId,
          toolCallId: toolCall.id!,
          toolCallName: toolCall.name,
          newArgs: toolCall.args,
          newClientArgs: clientSideArgs,
        });
        sendClientSideUpdate({
          kind: "update-tool-call",
          conversationId: state.conversationData.id,
          messageId: aiMessageId,
          toolCallId: toolCall.id!,
          newArgs: toolCall.args,
        });
      })
    );

    return {
      conversationData: stateConvo.data,
    };
  };

  const callTools = async (state: AgentState, config: RunnableConfig) => {
    const stateConvo = new ServerSideChatConversation(
      structuredClone(state.conversationData)
    );
    const lastMessage = stateConvo.getAIMessageAt(state.chatBranch);
    if (!lastMessage) {
      console.error("No last message, this is unexpected");
      return;
    }
    const aiMessageId = lastMessage.id;

    const lastPart = lastMessage.parts[lastMessage.parts.length - 1];
    if (!lastPart) {
      console.error("No last part, this is unexpected");
      return;
    }

    const sendServerSideUpdate = (update: ServerSideConversationUpdate) => {
      stateConvo.processMessageUpdate(update);
    };

    const sendClientSideUpdate = (update: ClientSideConversationUpdate) => {
      sendClientSideUpdateToConfig(update, config);
    };

    console.log("Calling tools");
    await Promise.all(
      lastPart.toolCalls.map(async (toolCall) => {
        const tool = toolsList.find((t) => t.name === toolCall.name)!;

        console.log("Calling tool", tool.name);

        const progressDebouncer = new Debouncer(debounceMs, (progress) => {
          sendClientSideUpdate({
            kind: "update-tool-call",
            conversationId: state.conversationData.id,
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newProgressStatus: progress,
          });
        });

        // Call the tool
        const result = await tool.invoke(toolCall.args, {
          callbacks: [
            {
              handleCustomEvent(name, data) {
                if (name === "on_structured_tool_progress") {
                  progressDebouncer.debounce(data);
                }
              },
            },
          ],
        });

        console.log("Tool result", result);

        const clientSideResult = await tool.mapResultForClient?.(result);
        progressDebouncer.flush();

        // Make sure the result is up to date
        sendServerSideUpdate({
          kind: "update-tool-call",
          conversationId: state.conversationData.id,
          messageId: aiMessageId,
          toolCallId: toolCall.id!,
          newResult: result,
          newClientResult: clientSideResult,
        });
        sendClientSideUpdate({
          kind: "update-tool-call",
          conversationId: state.conversationData.id,
          messageId: aiMessageId,
          toolCallId: toolCall.id!,
          newResult: result,
        });
      })
    );

    console.log("Done calling tools");

    return {
      conversationData: stateConvo.data,
    };
  };

  const finalizeChat = async (state: AgentState, config: RunnableConfig) => {
    sendClientSideUpdateToConfig(
      {
        kind: "sync-conversation",
        conversationId: state.conversationData.id,
        conversationData: new ServerSideChatConversation(
          state.conversationData
        ).asClientSideConversation(),
        tree: state.chatBranch,
      },
      config
    );

    // Emit a finalize event
    dispatchCustomEvent("on_conversation_finalize", {
      conversationData: state.conversationData,
      chatBranch: state.chatBranch,
    } satisfies FinalizeConversationMessage<Tools>);
  };

  const workflow = new StateGraph(StateAnnotation)
    .addNode("init", handleErrors(initializeNewMessage))
    .addNode("agent", handleErrors(callModel))
    .addNode("tools", handleErrors(callTools))
    .addNode("finalize", handleErrors(finalizeChat))
    .addEdge(START, "init")
    .addConditionalEdges("agent", handleErrors(shouldContinue), {
      continue: "tools",
      end: "finalize",
    })
    .addEdge("init", "agent")
    .addEdge("tools", "agent")
    .addEdge("finalize", END);

  return workflow.compile({});
}

const agent = createAdvancedReactAgent({
  llm: new ChatOpenAI({
    modelName: "gpt-4o",
  }),
  tools: allTools,
  debounceMs: 0,
});

const events = await agent.streamEvents(
  {
    humanMessageContent:
      "Try calling the greet function with an arbitrary 8 word long string for testing, I want to make sure it works.",
    conversationData: ServerSideChatConversation.newConversationData("test"),
    chatBranch: [],
  },
  {
    version: "v2",
  }
);

for await (const event of events) {
  try {
    if (event.name === "on_conversation_update") {
      console.log(event);
      const eventData = event.data as ClientSideUpdate;
      useConversationStore.getState().processClientEvent(eventData);
    }
    if (event.name === "on_conversation_finalize") {
      const eventData = event.data as FinalizeConversationMessage<
        typeof allTools
      >;
      const convo = new ServerSideChatConversation(eventData.conversationData);
      console.log(
        JSON.stringify(
          convo.getAIMessageAt(eventData.chatBranch)?.parts,
          null,
          2
        )
      );
      console.log(
        JSON.stringify(
          useConversationStore.getState().conversations[convo.data.id].data
            .aiMessages,
          null,
          2
        )
      );
    }
  } catch (e) {
    console.error(e);
  }
}
