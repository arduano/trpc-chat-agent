import { trpc } from '../trpc';

export function HelloWorld() {
  const greeting = trpc.greeting.useQuery('Friend');
  const messages = trpc.onMessage.useSubscription(undefined, {
    onData: (message) => {
      console.log('New message:', message);
    },
  });

  return (
    <div>
      <h1>{greeting.data}</h1>
      <p>Check the console for subscription messages!</p>
    </div>
  );
}
