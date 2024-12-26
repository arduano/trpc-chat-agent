import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  MessageContent,
  AIMessageChunk,
  isAIMessageChunk,
} from "@langchain/core/messages";
import { parsePartialJson } from "@langchain/core/output_parsers";
import { RunnableLambda, RunnableConfig } from "@langchain/core/runnables";
import {
  Annotation,
  MessagesAnnotation,
  interrupt,
  StateGraph,
  START,
  END,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { Debouncer } from "./src/debounce";
import { AnyStructuredChatTool } from "./tool";
import {
  ServerSideConversationData,
  ChatTree,
  ClientSideUpdate,
  ServerSideUpdate,
  ServerSideChatConversation,
  HumanMessageData,
  AdvancedAIMessageData,
  ServerSideConversationUpdate,
  ClientSideConversationUpdate,
  ClientSideChatConversation,
} from "./types";

function makeStateAnnotation<Tools extends readonly AnyStructuredChatTool[]>() {
  return Annotation.Root({
    conversationData: Annotation<ServerSideConversationData<Tools>>,
    chatBranch: Annotation<ChatTree>,
    humanMessageContent: Annotation<MessageContent>,
  });
}

export type AdvancedReactAgent<
  Tools extends readonly AnyStructuredChatTool[] = any
> = {
  // Not real data, just a marker type
  __toolTypes?: Tools;
};

export function createAdvancedReactAgent<
  const Tools extends readonly AnyStructuredChatTool[]
>(args: { llm: BaseChatModel; tools: Tools; debounceMs: number }) {
  const { llm, tools, debounceMs } = args;
  const toolsList = tools as any as AnyStructuredChatTool[]; // Remove "readonly"

  const StateAnnotation = makeStateAnnotation();
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
    dispatchCustomEvent("on_conversation_client_update", update, config);
  };

  const sendServerSideUpdateToConfig = (
    update: ServerSideUpdate,
    config: RunnableConfig
  ) => {
    dispatchCustomEvent("on_conversation_server_update", update, config);
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
    sendServerSideUpdateToConfig(
      {
        kind: "sync-conversation",
        conversationData: stateConvo.data,
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

    const sendServerSideUpdate = (update: ServerSideConversationUpdate) => {
      sendServerSideUpdateToConfig(update, config);
      stateConvo.processMessageUpdate(update);
    };

    const sendClientSideUpdate = (update: ClientSideConversationUpdate) => {
      sendClientSideUpdateToConfig(update, config);
    };

    try {
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
                      newState: "loading",
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
            newState: "loading",
          });
        })
      );

      return {
        conversationData: stateConvo.data,
      };
    } catch (e) {
      console.error(e);
      throw e;
    }
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
      sendServerSideUpdateToConfig(update, config);
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
            newState: "loading",
          });
        });

        // Call the tool
        try {
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
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newResult: result,
            newClientResult: clientSideResult,
            newState: "complete",
          });
          sendClientSideUpdate({
            kind: "update-tool-call",
            conversationId: state.conversationData.id,
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newResult: result,
            newState: "complete",
          });
        } catch (e) {
          // Tool errored, abort it
          sendServerSideUpdate({
            kind: "update-tool-call",
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newState: "aborted",
          });
          sendClientSideUpdate({
            kind: "update-tool-call",
            conversationId: state.conversationData.id,
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newState: "aborted",
          });
        }
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

  const compiled = workflow.compile({});

  return compiled as typeof compiled & AdvancedReactAgent<Tools>;
}

export type AgentTools<Agent extends AdvancedReactAgent<any>> =
  Agent extends AdvancedReactAgent<infer Tools> ? NonNullable<Tools> : never;

export type AdvancedReactAgentConversation<
  Agent extends AdvancedReactAgent<any>
> = ServerSideChatConversation<AgentTools<Agent>>;

export type AdvancedReactAgentClientConversation<
  Agent extends AdvancedReactAgent<any>
> = ClientSideChatConversation<AgentTools<Agent>>;
