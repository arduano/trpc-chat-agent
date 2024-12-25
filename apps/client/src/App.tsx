import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient } from './trpc';
import { HelloWorld } from './components/HelloWorld';

const queryClient = new QueryClient();

function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <HelloWorld />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export default App;
