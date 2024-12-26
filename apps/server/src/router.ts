import { initTRPC } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  AdvancedReactAgent,
  createAdvancedReactAgent,
  CreateAdvancedReactAgentArgs,
} from "../advancedReactAgent";
import { AnyStructuredChatTool, StructuredChatTool } from "../tool";
import {
  ChatTree,
  chatBranchZod,
  ClientSideUpdate,
  ServerSideChatConversation,
  ServerSideUpdate,
} from "../types";
import { Runnable } from "@langchain/core/runnables";
import { agent } from "./agent";

export const t = initTRPC.create();

function makeChatRouterForAgent<Agent extends AdvancedReactAgent>(
  agent: Agent
) {
  const router = t.router({
    promptChat: t.procedure
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

    getChat: t.procedure
      .input(z.object({ conversationId: z.string() }))
      .query(({ input }) => {
        return serverSideConversation.asClientSideConversation();
      }),
  });

  return router;
}

const router = t.router({
  chat: makeChatRouterForAgent(agent),
});

const serverSideConversation = new ServerSideChatConversation<typeof agent>(
  ServerSideChatConversation.newConversationData("test")
);

export type AppRouter = typeof router;
export default router;
