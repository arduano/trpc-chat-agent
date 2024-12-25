import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import dotenv from "dotenv";
import { JsonOutputToolsParser } from "@langchain/core/output_parsers/openai_tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool, DynamicTool } from "@langchain/core/tools";
import { ChatAnthropic } from "@langchain/anthropic";

dotenv.config();

export const chatModel = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.7,
  streaming: true,
});
export const chatModel2 = new ChatAnthropic({
  modelName: "gpt-4o",
  temperature: 0.7,
  streaming: true,
});

export const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful AI assistant."],
  ["human", "{input}"],
]);

export const chain = prompt.pipe(chatModel);

export const graph = createReactAgent({
  llm: chatModel,
  tools: [
    new DynamicStructuredTool({
      name: "hello",
      description: "Greet the user",
      func: async (input: string) => {
        return `Hello ${input}`;
      },
    }),
  ],
});
