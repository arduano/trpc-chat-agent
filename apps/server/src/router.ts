import { initTRPC } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { chain, graph } from "./langchain";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";

export const t = initTRPC.create();

const router = t.router({
  greeting: t.procedure.input(z.string().optional()).query(({ input }) => {
    return `Hello ${input ?? "World"}!`;
  }),

  // Example subscription
  onMessage: t.procedure.subscription(() => {
    return observable<string>((emit) => {
      const timer = setInterval(() => {
        emit.next("Server message " + new Date().toISOString());
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    });
  }),

  chat: t.procedure.input(z.string()).subscription(async ({ input }) => {
    return observable<string>((emit) => {
      let fullResponse = "";

      // Start the chain
      const runChain = async () => {
        try {
          const stream = await graph.streamEvents(
            {
              messages: [
                {
                  role: "user",
                  content: input,
                },
              ],
            },
            {
              streamMode: "values",
              version: "v2",
            }
          );

          // console.log(stream);
          for await (const chunk of stream) {
            const kind = chunk.event;
            console.log(`${kind}: ${chunk.name}`);
            emit.next(chunk);
          }

          emit.complete();
        } catch (error) {
          console.error("Error in chat stream:", error);
          emit.error(error);
        }
      };

      // Run the chain
      runChain();

      // Cleanup function
      return () => {
        // Any cleanup if needed
      };
    });
  }),
});

export type AppRouter = typeof router;
export default router;
