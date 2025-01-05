import { EventEmitter } from 'node:events';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';

export const ee = new EventEmitter();

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

ee.on('message', (data) => {
  console.log(data);
});

export const appRouter = router({
  onMessage: t.procedure.subscription(() => {
    return observable<{ message: string; timestamp: number }>((emit) => {
      const onMessage = (data: { message: string; timestamp: number }) => {
        emit.next(data);
      };

      ee.on('message', onMessage);

      return () => {
        ee.off('message', onMessage);
      };
    });
  }),
  sendMessage: t.procedure
    .input((value: unknown) => {
      if (typeof value !== 'string') {
        throw new TypeError('Invalid input');
      }

      return value;
    })
    .mutation((opts) => {
      const message = {
        message: opts.input,
        timestamp: Date.now(),
      };
      ee.emit('message', message);
      return message;
    }),
});

export type AppRouter = typeof appRouter;
