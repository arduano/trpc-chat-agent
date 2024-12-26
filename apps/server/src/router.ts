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
import { makeChatRouterForAgent } from "../chatRouter";

export const t = initTRPC.create();

const router = t.router({
  chat: makeChatRouterForAgent({
    agent,
    getConversation: async () => {
      return serverSideConversation.data;
    },
    saveConversation: async (id, data) => {
      serverSideConversation.data = data;
    },
  }),
});

const serverSideConversation = new ServerSideChatConversation<typeof agent>(
  ServerSideChatConversation.newConversationData("test")
);

export type AppRouter = typeof router;
export default router;
