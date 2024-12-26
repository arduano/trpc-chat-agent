import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Chat } from './components/Chat';
import { trpc, trpcClient } from './trpc';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <Chat />
      </trpc.Provider>
    </QueryClientProvider>
  );
}
