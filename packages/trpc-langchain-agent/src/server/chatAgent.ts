import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AIMessageChunk, BaseMessage, MessageContent } from '@langchain/core/messages';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import type { MessagesAnnotation } from '@langchain/langgraph';
import type {
  AdvancedAIMessageData,
  ChatTree,
  ClientSideConversationUpdate,
  ClientSideUpdate,
  HumanMessageData,
  ServerSideConversationData,
  ServerSideConversationUpdate,
  ServerSideUpdate,
} from '../common/types';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { isAIMessageChunk, SystemMessage } from '@langchain/core/messages';
import { parsePartialJson } from '@langchain/core/output_parsers';
import { RunnableLambda } from '@langchain/core/runnables';
import { Annotation, END, interrupt, START, StateGraph } from '@langchain/langgraph';
import { processMessageContentForClient } from '../common/content';
import { Debouncer } from '../common/debounce';
import { ServerSideChatConversation } from '../common/types';
import { type AnyStructuredChatTool, StructuredChatToolLangChain, type ToolCallbackInvoker } from './tool';

function makeStateAnnotation<Tools extends readonly AnyStructuredChatTool[], Context = any>() {
  return Annotation.Root({
    conversationData: Annotation<ServerSideConversationData<Tools>>,
    chatBranch: Annotation<ChatTree>,
    humanMessageContent: Annotation<MessageContent>,
    getCtx: Annotation<() => Context>,
    callbackInvoker: Annotation<ToolCallbackInvoker>,
  });
}

type StateAnnotationForTools<Tools extends readonly AnyStructuredChatTool[]> = ReturnType<
  typeof makeStateAnnotation<Tools>
>['State'];

export type CreateChatAgentArgs<Tools extends readonly AnyStructuredChatTool[]> = {
  llm: BaseChatModel;
  tools: Tools;
  debounceMs: number;

  systemMessage?: string | ((ctx: Tools[number]['TypeInfo']['Context']) => string | Promise<string>);

  transformMessages?: (
    conversation: Readonly<ServerSideChatConversation<ChatAgent<Tools>>>,
    branch: ChatTree,
    ctx: Tools[number]['TypeInfo']['Context']
  ) => BaseMessage[] | Promise<BaseMessage[]>;
};

export type ChatAgent<Tools extends readonly AnyStructuredChatTool[] = any> = Runnable<
  StateAnnotationForTools<Tools>
> & {
  // Not real data, just a marker type
  __toolTypes?: Tools;
};

export function createChatAgentLangchain<Tools extends readonly AnyStructuredChatTool[]>(
  args: CreateChatAgentArgs<Tools>
) {
  const { llm, tools, debounceMs: _debounceMs } = args;
  const debounceMs = _debounceMs || 100;

  const toolsList = tools.map((t) => new StructuredChatToolLangChain(t));

  const StateAnnotation = makeStateAnnotation();
  type AgentState = typeof StateAnnotation.State;

  if (!('bindTools' in llm) || typeof llm.bindTools !== 'function') {
    throw new Error(`llm ${llm} must define bindTools method.`);
  }
  const modelWithTools = llm.bindTools(toolsList);

  const stateModifierRunnable = RunnableLambda.from(
    (state: typeof MessagesAnnotation.State) => state.messages
  ).withConfig({ runName: 'state_modifier' });

  const modelRunnable = stateModifierRunnable.pipe(modelWithTools);

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
    conversation: Readonly<ServerSideChatConversation<ChatAgent<Tools>>>,
    branch: ChatTree,
    ctx: Tools[number]['TypeInfo']['Context']
  ) => {
    if (typeof args.transformMessages === 'function') {
      return addSystemMessage(await args.transformMessages(conversation, branch, ctx), ctx);
    }

    return addSystemMessage(conversation.asLangChainMessagesArray(branch), ctx);
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

  const initializeNewMessage = async (state: AgentState, config: RunnableConfig): Promise<Partial<AgentState>> => {
    const stateConvo = new ServerSideChatConversation(structuredClone(state.conversationData));

    const aiMessageId = 'ai-' + stateConvo.generateId();
    const humanMessageId = 'human-' + stateConvo.generateId();

    const newHumanMessage: HumanMessageData = {
      kind: 'human',
      id: humanMessageId,
      content: state.humanMessageContent,
    };

    const newAIMessage: AdvancedAIMessageData<Tools> = {
      kind: 'ai',
      id: aiMessageId,
      parts: [],
    };

    const newBranch = stateConvo.pushHumanAiMessagePair(state.chatBranch, newHumanMessage, newAIMessage);

    sendClientSideUpdateToConfig(
      {
        kind: 'sync-conversation',
        conversationId: state.conversationData.id,
        conversationData: new ServerSideChatConversation(stateConvo.data).asClientSideConversation(),
        branch: newBranch,
      },
      config
    );
    sendServerSideUpdateToConfig(
      {
        kind: 'sync-conversation',
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
    const stateConvo = new ServerSideChatConversation(structuredClone(state.conversationData));

    const messageList = await transformMessages(stateConvo, state.chatBranch, state.getCtx);

    const aiMessage = stateConvo.getAIMessageAt(state.chatBranch);
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
    const stateConvo = new ServerSideChatConversation(structuredClone(state.conversationData));
    const lastMessage = stateConvo.getAIMessageAt(state.chatBranch);
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
            ctx: state.getCtx,
            callbackInvoker: state.callbackInvoker,
            toolCallId: toolCall.id,
            progressCallback: (data: any) => {
              progressDebouncer.debounce(data);
            },
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

  const finalizeChat = async (state: AgentState, config: RunnableConfig) => {
    sendClientSideUpdateToConfig(
      {
        kind: 'sync-conversation',
        conversationId: state.conversationData.id,
        conversationData: new ServerSideChatConversation(state.conversationData).asClientSideConversation(),
        branch: state.chatBranch,
      },
      config
    );
  };

  const workflow = new StateGraph(StateAnnotation)
    .addNode('init', handleErrors(initializeNewMessage))
    .addNode('agent', handleErrors(callModel))
    .addNode('tools', handleErrors(callTools))
    .addNode('finalize', handleErrors(finalizeChat))
    .addEdge(START, 'init')
    .addConditionalEdges('agent', handleErrors(shouldContinue), {
      continue: 'tools',
      end: 'finalize',
    })
    .addEdge('init', 'agent')
    .addEdge('tools', 'agent')
    .addEdge('finalize', END);

  const compiled = workflow.compile({});

  return compiled as typeof compiled & ChatAgent<Tools>;
}
