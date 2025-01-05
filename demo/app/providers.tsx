'use client';

import { trpc } from '@/utils/trpc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, splitLink, unstable_httpSubscriptionLink } from '@trpc/client';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          // uses the httpSubscriptionLink for subscriptions
          condition: (op) => op.type === 'subscription',
          true: unstable_httpSubscriptionLink({
            url: `/api/trpc`,
          }),
          false: httpBatchLink({
            url: `/api/trpc`,
          }),
        }),
      ],
    })
  );

  const TrpcProvider = trpc.Provider;
  return (
    <TrpcProvider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TrpcProvider>
  );
}
