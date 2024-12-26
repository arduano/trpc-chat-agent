import { initTRPC } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAdvancedReactAgent } from "../advancedReactAgent";
import { StructuredChatTool } from "../tool";
import {
  ChatTree,
  chatBranchZod,
  ClientSideUpdate,
  ServerSideChatConversation,
  ServerSideUpdate,
} from "../types";

export const t = initTRPC.create();

const router = t.router({
  chat2: t.procedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        humanMessageContent: z.string(),
        branch: chatBranchZod,
      })
    )
    .subscription(async ({ input }) => {
      return observable<ClientSideUpdate>((emit) => {
        const controller = new AbortController();

        const runAgent = async () => {
          const conversation = serverSideConversation;
          let chatBranch: ChatTree = input.branch;

          try {
            const events = await agent.streamEvents(
              {
                humanMessageContent: input.humanMessageContent,
                conversationData: structuredClone(conversation.data),
                chatBranch,
              },
              {
                version: "v2",
                signal: controller.signal,
              }
            );

            for await (const event of events) {
              try {
                if (event.name === "on_conversation_client_update") {
                  const eventData = event.data as ClientSideUpdate;
                  emit.next(eventData);
                }
                if (event.name === "on_conversation_server_update") {
                  const eventData = event.data as ServerSideUpdate;

                  if (eventData.kind === "sync-conversation") {
                    chatBranch = eventData.tree;
                    conversation.data = eventData.conversationData;
                  } else {
                    conversation.processMessageUpdate(eventData);
                  }
                }
              } catch (e) {
                console.error(e);
              }
            }
          } catch (e) {
            console.error(e);
          }

          conversation.abortAllPendingToolCalls();
          serverSideConversation.data = conversation.data;
          emit.complete();
        };

        runAgent();

        return () => {
          controller.abort();
        };
      });
    }),

  getChatData: t.procedure
    .input(z.object({ conversationId: z.string() }))
    .query(({ input }) => {
      return serverSideConversation.asClientSideConversation();
    }),
});

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

export const agent = createAdvancedReactAgent({
  llm: new ChatOpenAI({
    modelName: "gpt-4o",
  }),
  tools: allTools,
  debounceMs: 0,
});

const serverSideConversation = new ServerSideChatConversation<typeof agent>(
  ServerSideChatConversation.newConversationData("test")
);

export type AppRouter = typeof router;
export default router;
