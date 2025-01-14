import { createContext } from '@/server/context';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

const handler = async (req: Request) => {
  // Import the router dynamically, as we don't have an OpenAI API key at server-side build time
  const router = await import('@/server/trpc').then((m) => m.appRouter);

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router,
    createContext,
  });
};

export { handler as GET, handler as POST };
