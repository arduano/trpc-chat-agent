import { createTRPCReact } from "@trpc/react-query";
import { createTRPCProxyClient, createWSClient, wsLink } from "@trpc/client";
import type { AppRouter } from "../../server/src/router";

export const trpc = createTRPCReact<AppRouter>();

const wsClient = createWSClient({
  url: "ws://localhost:3000",
});

export const trpcClient = trpc.createClient({
  links: [wsLink({ client: wsClient })],
});

export const rawTrpc = createTRPCProxyClient<AppRouter>({
  links: [wsLink({ client: wsClient })],
});