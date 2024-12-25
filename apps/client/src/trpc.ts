import { createTRPCReact } from '@trpc/react-query';
import { createWSClient, wsLink } from '@trpc/client';
import type { router } from '../../server/src/router';

export const trpc = createTRPCReact<typeof router>();

const wsClient = createWSClient({
  url: 'ws://localhost:3000',
});

export const trpcClient = trpc.createClient({
  links: [wsLink({ client: wsClient })],
});
