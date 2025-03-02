import type { Callbacks as LangchainCallbacks } from '@langchain/core/callbacks/manager';
import type { AIMessageChunk, BaseMessage, UsageMetadata } from '@langchain/core/messages';
import type { ToolCall as LangChainToolCall } from '@langchain/core/messages/tool';
import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  AIMessageData,
  AIMessagePartData,
  AnyChatAgent,
  AnyStructuredChatTool,
  ChatAgent,
  ChatAgentInvokeArgs,
  ChatTreePath,
  ClientSideConversationUpdate,
  ClientSideUpdate,
  ServerSideConversation,
  ServerSideConversationUpdate,
  ServerSideUpdate,
  ToolCallbackInvoker,
  UserMessageData,
} from '@trpc-chat-agent/core';
import type { z } from 'zod';
import type { ChatModelOrInvoker } from './chatModelInvoker';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, isAIMessageChunk, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { parsePartialJson } from '@langchain/core/output_parsers';
import { Annotation, END, interrupt, START, StateGraph } from '@langchain/langgraph';
import { Debouncer, processMessageContentForClient, ServerSideChatConversationHelper } from '@trpc-chat-agent/core';
import { ChatModelInvoker, chatModelToInvoker } from './chatModelInvoker';
import { StructuredChatToolLangChain } from './tool';

function makeStateAnnotation<
  Tools extends readonly AnyStructuredChatTool[],
  Context,
  ExtraExternalArgs extends z.ZodTypeAny,
>() {
  return Annotation.Root({
    conversationData: Annotation<ServerSideConversation<Tools>>,
    chatPath: Annotation<ChatTreePath>,
    ctx: Annotation<Context>,
    callbackInvoker: Annotation<ToolCallbackInvoker>,
    extraArgs: Annotation<z.infer<ExtraExternalArgs>>,
    signal: Annotation<AbortSignal>,
  });
}

export type CreateChatAgentArgs<
  Tools extends readonly AnyStructuredChatTool[],
  ExtraExternalArgs extends z.ZodTypeAny,
> = {
  // Common
  tools: Tools;
  debounceMs?: number;

  // Transformation
  systemMessage?:
    | string
    | ((args: {
        ctx: Tools[number]['TypeInfo']['Context'];
        extraArgs: z.infer<ExtraExternalArgs>;
      }) => string | Promise<string>);

  transformMessages?: (args: {
    conversation: Readonly<ServerSideChatConversationHelper<ChatAgent<Tools, ExtraExternalArgs>>>;
    path: ChatTreePath;
    ctx: Tools[number]['TypeInfo']['Context'];
    extraArgs: z.infer<ExtraExternalArgs>;
  }) => BaseMessage[] | Promise<BaseMessage[]>;

  transformInvocation?: (
    args: ModelInvokeArgs,
    context: {
      ctx: Tools[number]['TypeInfo']['Context'];
      extraArgs: z.infer<ExtraExternalArgs>;
      conversation: Readonly<ServerSideChatConversationHelper<ChatAgent<Tools, ExtraExternalArgs>>>;
      path: ChatTreePath;
    }
  ) => ModelInvokeArgs | Promise<ModelInvokeArgs>;

  // LangChain
  llm:
    | ChatModelOrInvoker
    | ((args: { extraArgs: z.infer<ExtraExternalArgs> }) => ChatModelOrInvoker | Promise<ChatModelOrInvoker>);
  langchainCallbacks?: LangchainCallbacks;
};

export type ModelInvokeArgs = {
  llm: ChatModelOrInvoker;
  tools: StructuredChatToolLangChain[];
  messages: BaseMessage[];
};

type ChatAgentArgsWithExtraArgs<
  Tools extends readonly AnyStructuredChatTool[],
  ExtraExternalArgs extends z.ZodTypeAny,
> = CreateChatAgentArgs<Tools, ExtraExternalArgs> & {
  extraExternalArgsSchema: ExtraExternalArgs;
};

export function createChatAgentLangchain<
  const Tools extends readonly AnyStructuredChatTool[],
  const ExtraExternalArgs extends z.ZodTypeAny,
>(args: ChatAgentArgsWithExtraArgs<Tools, ExtraExternalArgs>): ChatAgent<Tools, ExtraExternalArgs> {
  const { llm, tools, debounceMs: _debounceMs, langchainCallbacks, extraExternalArgsSchema } = args;
  const debounceMs = _debounceMs || 100;

  const toolsList = tools.map((t) => new StructuredChatToolLangChain(t));

  const StateAnnotation = makeStateAnnotation<Tools, Tools[number]['TypeInfo']['Context'], ExtraExternalArgs>();
  type AgentState = typeof StateAnnotation.State;

  const sendClientSideUpdateToConfig = (update: ClientSideUpdate, config: RunnableConfig) => {
    dispatchCustomEvent('on_conversation_client_update', update, config);
  };

  const sendServerSideUpdateToConfig = (update: ServerSideUpdate, config: RunnableConfig) => {
    dispatchCustomEvent('on_conversation_server_update', update, config);
  };

  const addSystemMessage = async (
    messages: BaseMessage[],
    ctx: Tools[number]['TypeInfo']['Context'],
    extraArgs: z.infer<ExtraExternalArgs>
  ) => {
    if (typeof args.systemMessage === 'string') {
      messages.unshift(new SystemMessage(args.systemMessage));
    } else if (typeof args.systemMessage === 'function') {
      messages.unshift(new SystemMessage(await args.systemMessage({ ctx, extraArgs })));
    }
    return messages;
  };

  const transformMessages = async (
    conversation: Readonly<ServerSideChatConversationHelper<ChatAgent<Tools, ExtraExternalArgs>>>,
    path: ChatTreePath,
    ctx: Tools[number]['TypeInfo']['Context'],
    extraArgs: z.infer<ExtraExternalArgs>
  ) => {
    if (typeof args.transformMessages === 'function') {
      return addSystemMessage(await args.transformMessages({ conversation, path, ctx, extraArgs }), ctx, extraArgs);
    }

    return addSystemMessage(asLangChainMessagesArray(conversation, path), ctx, extraArgs);
  };

  const handleErrors = (fn: (...args: any[]) => any) => {
    return (...args: any[]) => {
      try {
        return fn(...args);
      } catch (e) {
        console.error(e);
        interrupt({
          kind: 'error',
          error: e,
        });
      }
    };
  };

  const shouldContinue = (state: AgentState) => {
    if (state.signal.aborted) {
      return 'end';
    }

    const stateConvo = new ServerSideChatConversationHelper(state.conversationData);
    const lastMessage = stateConvo.getAIMessageAt(state.chatPath);

    if (!lastMessage) {
      console.error('No last message, this is unexpected');
      return 'end';
    }

    const lastPart = lastMessage.parts[lastMessage.parts.length - 1];
    if (!lastPart) {
      console.error('No last part, this is unexpected');
      return 'end';
    }

    const toolCalls = lastPart.toolCalls;
    if (toolCalls && toolCalls.length > 0) {
      return 'continue';
    } else {
      return 'end';
    }
  };

  const callModel = async (state: AgentState, config: RunnableConfig) => {
    const stateConvo = new ServerSideChatConversationHelper(structuredClone(state.conversationData));

    const messageList = await transformMessages(stateConvo, state.chatPath, state.ctx, state.extraArgs);

    const aiMessage = stateConvo.getAIMessageAt(state.chatPath);
    if (!aiMessage) {
      console.error('No AI message for ID, this is unexpected');
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
      const selectedLlm =
        llm instanceof BaseChatModel || llm instanceof ChatModelInvoker
          ? llm
          : await llm({ extraArgs: state.extraArgs });

      const modelParams: ModelInvokeArgs = {
        llm: selectedLlm,
        tools: toolsList,
        messages: messageList,
      };

      const mappedModelParams = args.transformInvocation
        ? await args.transformInvocation(modelParams, {
            ctx: state.ctx,
            extraArgs: state.extraArgs,
            conversation: stateConvo,
            path: state.chatPath,
          })
        : modelParams;

      const finalSelectedLlm = mappedModelParams.llm;
      const finalTools = mappedModelParams.tools;
      const finalMessageList = mappedModelParams.messages;

      const finalSelectedLlmInvoker = chatModelToInvoker(finalSelectedLlm);

      const stream = await finalSelectedLlmInvoker.invoke({
        config,
        messages: finalMessageList,
        signal: state.signal,
        tools: finalTools,
      });

      let aggregateChunk: AIMessageChunk | undefined;
      let currentToolId: string | undefined;

      const allDebouncers: Debouncer<any>[] = [];
      let currentToolClientPreview: Debouncer<any> | null = null;

      sendServerSideUpdate({
        kind: 'begin-new-ai-message-part',
        conversationId: state.conversationData.id,
        messageId: aiMessageId,
      });
      sendClientSideUpdate({
        kind: 'begin-new-ai-message-part',
        conversationId: state.conversationData.id,
        messageId: aiMessageId,
      });

      for await (const chunk of stream) {
        // console.log(chunk);
        if (chunk.event === 'on_chat_model_stream') {
          const data = chunk.data.chunk;
          if (isAIMessageChunk(data)) {
            if (!aggregateChunk) {
              aggregateChunk = data;
            } else {
              aggregateChunk = aggregateChunk.concat(data);
            }

            sendServerSideUpdate({
              kind: 'update-content',
              messageId: aiMessageId,
              totalContent: aggregateChunk.content,
            });

            if (data.content.length > 0) {
              const processedDelta = processMessageContentForClient(data.content);
              sendClientSideUpdate({
                kind: 'update-content',
                conversationId: state.conversationData.id,
                messageId: aiMessageId,
                contentToAppend: processedDelta,
              });
            }

            const toolId = data.tool_call_chunks?.[0]?.id;
            const toolName = data.tool_call_chunks?.[0]?.name;
            if (toolId && toolName && toolId !== currentToolId) {
              const tool = toolsList.find((t) => t.name === toolName);

              if (tool) {
                sendClientSideUpdate({
                  kind: 'begin-tool-call',
                  conversationId: state.conversationData.id,
                  messageId: aiMessageId,
                  toolCallId: toolId,
                  toolCallName: toolName,
                });

                currentToolId = toolId;
                currentToolClientPreview = tool.makeDebouncedArgsMapper(debounceMs, (args) => {
                  sendClientSideUpdate({
                    kind: 'update-tool-call',
                    conversationId: state.conversationData.id,
                    messageId: aiMessageId,
                    toolCallId: toolId,
                    newArgs: args,
                    newState: 'loading',
                  });
                });
                allDebouncers.push(currentToolClientPreview!);
              }
            }

            if (currentToolClientPreview && currentToolId) {
              const toolCall = aggregateChunk.tool_call_chunks?.find((c) => c.id === currentToolId);

              if (toolCall?.args) {
                try {
                  const json = parsePartialJson(toolCall.args);
                  if (json) {
                    currentToolClientPreview?.debounce(json);
                  }
                } catch (e) {
                  console.error('Error parsing tool args:', e);
                }
              }
            }
          }
        }

        if (chunk.event === 'on_chat_model_end') {
          const data = chunk.data.output;
          if (isAIMessageChunk(data)) {
            aggregateChunk = data;
          }
        }
      }

      if (!aggregateChunk) {
        console.error('No aggregate chunk, this is unexpected');
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
            kind: 'begin-tool-call',
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            toolCallName: toolCall.name,
            newArgs: toolCall.args,
            newClientArgs: clientSideArgs,
          });
          sendClientSideUpdate({
            kind: 'update-tool-call',
            conversationId: state.conversationData.id,
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newArgs: toolCall.args,
            newState: 'loading',
          });
        })
      );

      return {
        conversationData: stateConvo.data,
      };
    } catch (e) {
      if (!state.signal?.aborted) {
        console.error(e);
      }
      throw e;
    }
  };

  const callTools = async (state: AgentState, config: RunnableConfig) => {
    const stateConvo = new ServerSideChatConversationHelper(structuredClone(state.conversationData));
    const lastMessage = stateConvo.getAIMessageAt(state.chatPath);
    if (!lastMessage) {
      console.error('No last message, this is unexpected');
      return;
    }
    const aiMessageId = lastMessage.id;

    const lastPart = lastMessage.parts[lastMessage.parts.length - 1];
    if (!lastPart) {
      console.error('No last part, this is unexpected');
      return;
    }

    const sendServerSideUpdate = (update: ServerSideConversationUpdate) => {
      sendServerSideUpdateToConfig(update, config);
      stateConvo.processMessageUpdate(update);
    };

    const sendClientSideUpdate = (update: ClientSideConversationUpdate) => {
      sendClientSideUpdateToConfig(update, config);
    };

    await Promise.all(
      lastPart.toolCalls.map(async (toolCall) => {
        const tool = toolsList.find((t) => t.name === toolCall.name)!;

        const progressDebouncer = new Debouncer(debounceMs, (progress) => {
          sendClientSideUpdate({
            kind: 'update-tool-call',
            conversationId: state.conversationData.id,
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newProgressStatus: progress,
            newState: 'loading',
          });
        });

        // Call the tool
        try {
          const { response, clientResult } = await tool.invoke({
            input: toolCall.args,
            ctx: state.ctx,
            callbackInvoker: state.callbackInvoker,
            toolCallId: toolCall.id,
            progressCallback: (data: any) => {
              progressDebouncer.debounce(data);
            },
            conversation: stateConvo,
            conversationPath: state.chatPath,
            signal: state.signal,
            pastMessages: stateConvo.asMessagesArray(state.chatPath),
            lastUserMessage: stateConvo.getUserMessageAt(state.chatPath)!,
            extraArgs: state.extraArgs,
          });

          progressDebouncer.flush();

          // Make sure the result is up to date
          sendServerSideUpdate({
            kind: 'update-tool-call',
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newResult: response,
            newClientResult: clientResult,
            newState: 'complete',
          });
          sendClientSideUpdate({
            kind: 'update-tool-call',
            conversationId: state.conversationData.id,
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newResult: clientResult,
            newState: 'complete',
          });
        } catch (e) {
          console.error(e);

          const aiResult = await tool.mapErrorForAI?.(e);

          // Tool errored, abort it
          sendServerSideUpdate({
            kind: 'update-tool-call',
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newResult: aiResult ?? 'The tool has responded with an unexpected error',
            newState: 'aborted',
          });
          sendClientSideUpdate({
            kind: 'update-tool-call',
            conversationId: state.conversationData.id,
            messageId: aiMessageId,
            toolCallId: toolCall.id!,
            newState: 'aborted',
          });
        }
      })
    );

    return {
      conversationData: stateConvo.data,
    };
  };

  const workflow = new StateGraph(StateAnnotation)
    .addNode('agent', handleErrors(callModel))
    .addNode('tools', handleErrors(callTools))
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', handleErrors(shouldContinue), {
      continue: 'tools',
      end: END,
    })
    .addEdge('tools', 'agent');

  const compiled = workflow.compile({});

  return {
    extraArgsSchema: extraExternalArgsSchema,
    async *invoke(args: ChatAgentInvokeArgs<Tools, ExtraExternalArgs>) {
      const iter = compiled.streamEvents(
        {
          conversationData: args.conversationData,
          chatPath: args.chatPath,
          ctx: args.ctx,
          callbackInvoker: args.callbackInvoker,
          extraArgs: args.extraArgs,
          signal: args.signal,
        },
        {
          version: 'v2',
          callbacks: langchainCallbacks,
        }
      );
      try {
        for await (const event of iter) {
          try {
            if (event.name === 'on_conversation_client_update') {
              const eventData = event.data as ClientSideUpdate;
              yield {
                side: 'client',
                update: eventData,
              };
            }
            if (event.name === 'on_conversation_server_update') {
              const eventData = event.data as ServerSideUpdate;
              yield {
                side: 'server',
                update: eventData,
              };
            }
          } catch (e) {
            if (!args.signal?.aborted) {
              console.error(e);
            }
          }
        }
      } catch (e) {
        if (!args.signal?.aborted) {
          console.error(e);
        }
      }
    },
  };
}

function aiMessageAsLangChainMessages<Tools extends readonly AnyStructuredChatTool[]>(
  message: AIMessageData<Tools>
): BaseMessage[] {
  function partHasContentOrToolCalls(part: AIMessagePartData<Tools>): boolean {
    return part.content.length > 0 || part.toolCalls.length > 0;
  }

  function partAsLangchainMessages(part: AIMessagePartData<Tools>): BaseMessage[] {
    const aiMessage = new AIMessage({
      content: processMessageContentForClient(part.content),
      tool_calls: part.toolCalls.map<LangChainToolCall>((tc) => ({
        name: tc.name,
        args: tc.args,
        id: tc.id,
        type: 'tool_call',
      })),
      response_metadata: part.responseMetadata,
      usage_metadata: part.usageMetadata as UsageMetadata,
    });

    const toolResponseMessages = part.toolCalls.map<ToolMessage>(
      (tc) =>
        new ToolMessage({
          content: tc.result ?? 'Tool execution cancelled before completion.',
          tool_call_id: tc.id,
        })
    );

    return [aiMessage, ...toolResponseMessages];
  }

  return message.parts.filter(partHasContentOrToolCalls).flatMap(partAsLangchainMessages);
}

function userMessageAsLangChainMessages(message: UserMessageData): BaseMessage[] {
  return [
    new HumanMessage({
      content: message.content,
    }),
  ];
}

export function asLangChainMessagesArray(
  conversation: Readonly<ServerSideChatConversationHelper<AnyChatAgent>>,
  tree: ChatTreePath
): BaseMessage[] {
  return conversation.asMessagesArray(tree).flatMap((message) => {
    switch (message.kind) {
      case 'ai':
        return aiMessageAsLangChainMessages(message);
      case 'user':
        return userMessageAsLangChainMessages(message);
      default:
        throw new UnreachableError(message);
    }
  });
}

class UnreachableError extends Error {
  constructor(_value: never, message?: string) {
    super(message);
  }
}
