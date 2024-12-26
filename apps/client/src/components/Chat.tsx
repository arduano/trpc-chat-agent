import { useState, useRef, useEffect, useMemo } from "react";
import { rawTrpc, trpc } from "../trpc";

import {
  AdvancedReactAgent,
  AgentTools,
} from "../../../server/advancedReactAgent";
import {
  AdvancedAIMessageDataClientSide,
  AdvancedToolCallClientSideFromToolsArray,
  ChatTree,
  ClientSideChatConversation,
  ClientSideConversationData,
  ClientSideUpdate,
  HumanMessageData,
} from "../../../server/types";
import { useConversationStore } from "../../../server/clientConversationStore";
import type { agent } from "../../../server/src/router";
import {
  AnyStructuredChatTool,
  StructuredChatTool,
} from "../../../server/tool";
import React from "react";

export function Chat() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const { messages, beginMessage, isStreaming } = useConversation<typeof agent>(
    {
      conversationId: "test",
      onUpdateConversationId: undefined,
    }
  );

  // useEffect(() => {
  //   scrollToBottom();
  // }, [messages]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    beginMessage(input);
    setInput("");
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-screen-xl sm:mx-auto w-full px-4">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-light-blue-500 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"></div>
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-screen-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <div className="h-[800px] overflow-auto mb-4 space-y-4">
                  <RenderMessages
                    messages={messages}
                    renderAiMessage={(message) => (
                      <>
                        {message.parts.map((part) => (
                          <>
                            {part.content && (
                              <div className="p-4 rounded-lg bg-gray-100 mr-8">
                                {part.content as string}
                              </div>
                            )}
                            {part.toolCalls.map((toolCall) => (
                              <RenderTool tool={toolCall} />
                            ))}
                          </>
                        ))}
                      </>
                    )}
                    renderHumanMessage={(message) => (
                      <div className="p-4 rounded-lg bg-blue-100 ml-8">
                        {message.content as string}
                      </div>
                    )}
                  />
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSubmit} className="mt-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={isStreaming}
                      className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Type your message..."
                    />
                    <button
                      type="submit"
                      disabled={isStreaming || !input.trim()}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Send
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RenderTool({
  tool,
}: {
  tool: AdvancedToolCallClientSideFromToolsArray<AgentTools<typeof agent>>;
}) {
  console.log(tool);

  const getStatusColor = (state: typeof tool.state) => {
    switch (state) {
      case "loading":
        return "bg-blue-500";
      case "complete":
        return "bg-green-500";
      case "aborted":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const renderToolContent = () => {
    switch (tool.name) {
      case "greet":
        return (
          <>
            <div className="flex gap-2">
              <span className="font-semibold">Name:</span>
              <span>{tool.args?.name}</span>
            </div>
            {tool.state !== 'complete' && tool.progressStatus?.loading && (
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 flex-grow rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${tool.progressStatus.loading}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600">
                  {tool.progressStatus.loading}%
                </span>
              </div>
            )}
            {tool.result && (
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2">
                {tool.result.message}
              </div>
            )}
          </>
        );

      case "greet2":
        return (
          <>
            <div className="flex gap-2">
              <span className="font-semibold">Formal Mode:</span>
              <span>{tool.args?.formal ? "Yes" : "No"}</span>
            </div>
            {tool.result && (
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2">
                {tool.result.greeting}
              </div>
            )}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="my-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${getStatusColor(tool.state)}`} />
        <h3 className="font-medium capitalize">{tool.name}</h3>
        <span className="text-sm text-gray-500">({tool.state})</span>
      </div>
      {renderToolContent()}
    </div>
  );
}

function RenderMemoed<T>({
  data,
  render,
}: {
  data: T;
  render: (data: T) => JSX.Element;
}) {
  const jsx = useMemo(() => render(data), [data]);
  return <>{jsx}</>;
}

function RenderMessages<Tools extends readonly AnyStructuredChatTool[]>({
  messages,
  renderAiMessage,
  renderHumanMessage,
}: {
  messages: (AdvancedAIMessageDataClientSide<Tools> | HumanMessageData)[];
  renderAiMessage: (
    message: AdvancedAIMessageDataClientSide<Tools>
  ) => JSX.Element;
  renderHumanMessage: (message: HumanMessageData) => JSX.Element;
}) {
  return (
    <>
      {messages.map((message) => {
        if (message.kind === "human") {
          return (
            <RenderMemoed
              key={message.id}
              data={message}
              render={renderHumanMessage}
            />
          );
        } else {
          return (
            <RenderMemoed
              key={message.id}
              data={message}
              render={renderAiMessage}
            />
          );
        }
      })}
    </>
  );
}

type UseConversationArgs = {
  conversationId?: string;
  onUpdateConversationId?: (conversationId: string) => void;
};

function useConversation<Agent extends AdvancedReactAgent>({
  conversationId,
  onUpdateConversationId,
}: UseConversationArgs) {
  // Use the mutation functions in the store
  const store = useConversationStore((data) => data.mutate);
  const conversationFromStore = useConversationStore((data) =>
    conversationId === undefined
      ? undefined
      : data.get.conversation(conversationId)
  );

  const [branch, setBranch] = useState<ChatTree>([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | undefined
  >(conversationId);

  const [isConversationMissing, setIsConversationMissing] = useState(false);

  const [placeholderConversation, setPlaceholderConversation] = useState<
    ClientSideChatConversation<Agent>
  >(() => ClientSideChatConversation.makePlaceholderConversation<Agent>());

  const { beginStream, cancelStream, isStreaming } = useConversationStreamer(
    (update) => {
      store.processClientEvent(update);

      if (update.kind === "sync-conversation") {
        setBranch(update.branch);
      }

      // Ensure the conversation ID is in sync. For example, when
      // the ID was undefined, but a new conversation was created
      if (currentConversationId !== update.conversationId) {
        onUpdateConversationId?.(update.conversationId);
        setCurrentConversationId(update.conversationId);
      }
    }
  );

  useEffect(() => {
    // Help make sure the conversation is in sync.
    // If the ID changes in an unexpected way, reset the chat.
    if (currentConversationId !== conversationId) {
      cancelStream();
      setCurrentConversationId(conversationId);
      setBranch([]);
      setPlaceholderConversation(
        ClientSideChatConversation.makePlaceholderConversation<Agent>()
      );
    }

    // Query the conversation to insert into the store if not present
    setIsConversationMissing(false);
    if (conversationId && !store.isConversationPresent(conversationId)) {
      rawTrpc.getChatData
        .query({ conversationId })
        .then((conversation) => {
          if (!conversation) {
            setIsConversationMissing(true);
          } else {
            const conversationClass = new ClientSideChatConversation(
              conversation
            );
            store.setConversationIfNotPresent(
              conversationId,
              conversationClass
            );
            setBranch(conversationClass.getDefaultTree());
          }
        })
        .catch(() => {
          setIsConversationMissing(true);
        });
    }
  }, [conversationId]);

  // Is loading when the conversation isn't guaranteed to be missing,
  // and the conversation isn't present in the store
  const isLoadingConversation =
    !isConversationMissing &&
    conversationId &&
    !store.isConversationPresent(conversationId);

  // Can start a new message when the conversation isn't guaranteed to be missing,
  // And when it's not loading
  const canStartNewMessage = !isConversationMissing && !isLoadingConversation;

  // Use the current conversation
  const conversation = (conversationFromStore ??
    placeholderConversation) as ClientSideChatConversation<Agent>;

  const beginMessage = (humanMessage: string) => {
    if (!canStartNewMessage) {
      if (isLoadingConversation) {
        throw new Error(
          "Cannot start a new message while the conversation is loading"
        );
      }
      if (isConversationMissing) {
        throw new Error(
          "Cannot start a new message while the conversation is missing"
        );
      }
      throw new Error("Cannot start a new message");
    }

    // Set the placeholder conversation, in case the conversation doesn't exist yet
    const placeholderConversation =
      ClientSideChatConversation.makePlaceholderConversation<Agent>();
    placeholderConversation.pushHumanAiMessagePair(
      [],
      {
        content: humanMessage,
        id: "-human-placeholder-",
        kind: "human",
      },
      {
        id: "-ai-placeholder-",
        kind: "ai",
        parts: [],
      }
    );
    setPlaceholderConversation(placeholderConversation);

    beginStream(conversationId, humanMessage, branch);
  };

  const messages = useMemo(() => {
    return conversation.asMessagesArray(branch);
  }, [conversation, branch]);

  return {
    beginMessage,
    messages,
    isStreaming,
    cancelStream,
    isLoadingConversation,
    isConversationMissing,
  };
}

function useConversationStreamer(onUpdate: (event: ClientSideUpdate) => void) {
  const [cancelCurrentStream, setCancelCurrentStream] = useState<
    (() => void) | undefined
  >(undefined);

  const cancelStream = () => {
    if (cancelCurrentStream) {
      cancelCurrentStream();
      setCancelCurrentStream(undefined);
    }
  };

  const beginStream = (
    conversationId: string | undefined,
    humanMessage: string,
    branch: ChatTree
  ) => {
    const subscription = rawTrpc.chat2.subscribe(
      {
        conversationId,
        branch: branch,
        humanMessageContent: humanMessage,
      },
      {
        onData: (updateEvent) => {
          onUpdate(updateEvent);
        },
        onComplete: () => {
          setCancelCurrentStream(undefined);
        },
        onError: (err) => {
          console.error("Chat error:", err);
          cancelStream();
        },
      }
    );

    setCancelCurrentStream((cancel) => {
      if (cancel) {
        cancel();
      }

      return () => {
        subscription.unsubscribe();
      };
    });
  };

  return {
    beginStream,
    cancelStream,
    isStreaming: !!cancelCurrentStream,
  };
}