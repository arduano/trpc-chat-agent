import type { Callbacks as LangchainCallbacks } from '@langchain/core/callbacks/manager';
import type { AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { MessagesAnnotation } from '@langchain/langgraph';
import type {
  AgentTools,
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
} from '@trpc-chat-agent/core';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { isAIMessageChunk, SystemMessage } from '@langchain/core/messages';
import { parsePartialJson } from '@langchain/core/output_parsers';
import { RunnableLambda } from '@langchain/core/runnables';
import { Annotation, END, interrupt, START, StateGraph } from '@langchain/langgraph';
import {
  ChatAIMessageWrapper,
  ChatUserMessageWrapper,
  Debouncer,
  processMessageContentForClient,
  ServerSideChatConversationHelper,
} from '@trpc-chat-agent/core';
import { z } from 'zod';
import { StructuredChatToolLangChain } from './tool';

type CommonExtraArgs = {
  selectedLlm?: string;
};

function makeStateAnnotation<Tools extends readonly AnyStructuredChatTool[], Context>() {
  return Annotation.Root({
    conversationData: Annotation<ServerSideConversation<Tools>>,
    chatPath: Annotation<ChatTreePath>,
    ctx: Annotation<Context>,
    callbackInvoker: Annotation<ToolCallbackInvoker>,
    extraArgs: Annotation<CommonExtraArgs>,
  });
}

type ExtraArgsFromSelectedLlms<SelectedLlms extends BaseChatModel | Record<string, BaseChatModel>> =
  SelectedLlms extends BaseChatModel
    ? // eslint-disable-next-line ts/no-empty-object-type
      z.ZodObject<{}>
    : SelectedLlms extends Record<string, BaseChatModel>
      ? z.ZodObject<{
          selectedLlm: z.ZodType<keyof SelectedLlms>;
        }>
      : never;

export type CreateChatAgentArgs<
  Tools extends readonly AnyStructuredChatTool[],
  SelectedLlms extends BaseChatModel | Record<string, BaseChatModel>,
> = {
  // Common
  tools: Tools;
  debounceMs?: number;

  // Transformation
  systemMessage?: string | ((ctx: Tools[number]['TypeInfo']['Context']) => string | Promise<string>);
  transformMessages?: (args: {
    conversation: Readonly<ServerSideChatConversationHelper<ChatAgent<Tools, ExtraArgsFromSelectedLlms<SelectedLlms>>>>;
    path: ChatTreePath;
    ctx: Tools[number]['TypeInfo']['Context'];
  }) => BaseMessage[] | Promise<BaseMessage[]>;

  // LangChain
  llm: SelectedLlms;
  langchainCallbacks?: LangchainCallbacks;
};

export function createChatAgentLangchain<
  const Tools extends readonly AnyStructuredChatTool[],
  const SelectedLlms extends BaseChatModel | Record<string, BaseChatModel>,
>(args: CreateChatAgentArgs<Tools, SelectedLlms>): ChatAgent<Tools, ExtraArgsFromSelectedLlms<SelectedLlms>> {
  const { llm, tools, debounceMs: _debounceMs, langchainCallbacks } = args;
  const debounceMs = _debounceMs || 100;

  type ExtraArgsSchema = ExtraArgsFromSelectedLlms<SelectedLlms>;
  const extraArgsSchema = (
    args.llm instanceof BaseChatModel
      ? z.object({})
      : z.object({
          selectedLlm: z.string(),
        })
  ) as ExtraArgsSchema;

  const toolsList = tools.map((t) => new StructuredChatToolLangChain(t));

  const StateAnnotation = makeStateAnnotation();
  type AgentState = typeof StateAnnotation.State;

  const stateModifierRunnable = RunnableLambda.from(
    (state: typeof MessagesAnnotation.State) => state.messages
  ).withConfig({ runName: 'state_modifier' });

  function mapSelectedLlmAndBindTools<SelectedLlms extends BaseChatModel | Record<string, BaseChatModel>>(
    llm: SelectedLlms
  ) {
    if (llm instanceof BaseChatModel) {
      if (!('bindTools' in llm) || typeof llm.bindTools !== 'function') {
        throw new Error(`llm ${llm} must define bindTools method.`);
      }
      const modelWithTools = llm.bindTools(toolsList);
      const modelRunnable = stateModifierRunnable.pipe(modelWithTools);
      return {
        default: modelRunnable,
      };
    } else {
      return Object.fromEntries(
        Object.entries(llm).map(([key, value]) => {
          if (!('bindTools' in value) || typeof value.bindTools !== 'function') {
            throw new Error(`llm ${value} must define bindTools method.`);
          }
          const modelWithTools = value.bindTools(toolsList);
          const modelRunnable = stateModifierRunnable.pipe(modelWithTools);
          return [key, modelRunnable];
        })
      );
    }
  }

  const modelRunnables = mapSelectedLlmAndBindTools(llm);

  const sendClientSideUpdateToConfig = (update: ClientSideUpdate, config: RunnableConfig) => {
    dispatchCustomEvent('on_conversation_client_update', update, config);
  };

  const sendServerSideUpdateToConfig = (update: ServerSideUpdate, config: RunnableConfig) => {
    dispatchCustomEvent('on_conversation_server_update', update, config);
  };

  const addSystemMessage = async (messages: BaseMessage[], ctx: Tools[number]['TypeInfo']['Context']) => {
    if (typeof args.systemMessage === 'string') {
      messages.unshift(new SystemMessage(args.systemMessage));
    } else if (typeof args.systemMessage === 'function') {
      messages.unshift(new SystemMessage(await args.systemMessage(ctx)));
    }
    return messages;
  };

  const transformMessages = async (
    conversation: Readonly<ServerSideChatConversationHelper<ChatAgent<Tools, ExtraArgsSchema>>>,
    path: ChatTreePath,
    ctx: Tools[number]['TypeInfo']['Context']
  ) => {
    if (typeof args.transformMessages === 'function') {
      return addSystemMessage(await args.transformMessages({ conversation, path, ctx }), ctx);
    }

    return addSystemMessage(asLangChainMessagesArray(conversation, path), ctx);
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

    const messageList = await transformMessages(stateConvo, state.chatPath, state.ctx);

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
      const selectedModelName = state.extraArgs.selectedLlm ?? 'default';
      const modelRunnable = modelRunnables[selectedModelName];

      const stream = await modelRunnable.streamEvents(
        { messages: messageList },
        {
          ...config,
          version: 'v2',
        }
      );

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
      console.error(e);
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
    extraArgsSchema,
    async *invoke(args: ChatAgentInvokeArgs<Tools, ExtraArgsSchema>) {
      const iter = compiled.streamEvents(
        {
          conversationData: args.conversationData,
          chatPath: args.chatPath,
          ctx: args.ctx,
          callbackInvoker: args.callbackInvoker,
          extraArgs: args.extraArgs,
        },
        {
          version: 'v2',
          signal: args.signal,
          callbacks: langchainCallbacks,
        }
      );
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
          console.error(e);
        }
      }
    },
  };
}

export function asLangChainMessagesArray(
  conversation: Readonly<ServerSideChatConversationHelper<AnyChatAgent>>,
  tree: ChatTreePath
): BaseMessage[] {
  return conversation.asMessagesArray(tree).flatMap((message) => {
    switch (message.kind) {
      case 'ai':
        return new ChatAIMessageWrapper<AgentTools<any>>(message).asLangChainMessages();
      case 'user':
        return [new ChatUserMessageWrapper(message).asLangChainMessage()];
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
