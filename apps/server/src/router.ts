import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

export const t = initTRPC.create();

export const router = t.router({
  greeting: t.procedure
    .input(z.string().optional())
    .query(({ input }) => {
      return `Hello ${input ?? 'World'}!`;
    }),
  
  // Example subscription
  onMessage: t.procedure.subscription(() => {
    return observable<string>((emit) => {
      const timer = setInterval(() => {
        emit.next('Server message ' + new Date().toISOString());
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    });
  }),
});
