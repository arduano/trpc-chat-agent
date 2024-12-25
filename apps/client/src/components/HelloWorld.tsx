import { trpc } from "../trpc";

export function HelloWorld() {
  const greeting = trpc.greeting.useQuery("Friend");
  const messages = trpc.onMessage.useSubscription(undefined, {
    onData: (message) => {
      console.log("New message:", message);
    },
  });

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {greeting.data}
        </h1>
        <p className="text-gray-600">
          Check the console for subscription messages!
        </p>
      </div>
    </div>
  );
}
