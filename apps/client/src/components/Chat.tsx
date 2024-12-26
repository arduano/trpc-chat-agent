import { useState, useRef, useEffect, useMemo } from "react";
import { rawTrpc, trpc } from "../trpc";

import { AdvancedReactAgent } from "../../../server/advancedReactAgent";
import {
  AdvancedAIMessageDataClientSide,
  ChatTree,
  ClientSideChatConversation,
  ClientSideConversationData,
  ClientSideUpdate,
  HumanMessageData,
} from "../../../server/types";
import { useConversationStore } from "../../../server/clientConversationStore";
import type { agent } from "../../../server/src/router";
import { AnyStructuredChatTool } from "../../../server/tool";

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
      <div className="relative py-3 sm:max-w-xl sm:mx-auto w-full px-4">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-light-blue-500 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"></div>
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <div className="h-[400px] overflow-auto mb-4 space-y-4">
                  <RenderMessages
                    messages={messages}
                    renderAiMessage={(message) => (
                      <>
                        {message.parts.map((part) => (
                          <div className="p-4 rounded-lg bg-gray-100 mr-8">
                            {part.content as string}
                          </div>
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
      {messages.map((message, index) => {
        if (message.kind === "human") {
          return (
            <RenderMemoed
              key={index}
              data={message}
              render={renderHumanMessage}
            />
          );
        } else {
          return (
            <RenderMemoed key={index} data={message} render={renderAiMessage} />
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
  const store = useConversationStore((data) => ({
    ...data.mutate,
    conversationFromStore:
      conversationId === undefined
        ? undefined
        : data.get.conversation(conversationId),
  }));

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
          console.log("Got conversation ID:", conversationId);
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
  const conversation = (store.conversationFromStore ??
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
