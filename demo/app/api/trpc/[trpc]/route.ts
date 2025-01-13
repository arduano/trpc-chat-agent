import { createContext } from '@/server/context';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

const handler = async (req: Request) => {
  const router = await import('@/server/trpc').then((m) => m.appRouter);
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router,
    createContext,
  });
};

export { handler as GET, handler as POST };
