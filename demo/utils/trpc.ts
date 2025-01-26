import type { AppRouter } from '@/server/trpc';
import { splitLink, unstable_httpBatchStreamLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => op.path.includes('promptChat'),
      true: unstable_httpBatchStreamLink({
        url: `/api/trpc`,
        methodOverride: 'POST',
      }),
      false: unstable_httpBatchStreamLink({
        url: `/api/trpc`,
      }),
    }),
  ],
});
