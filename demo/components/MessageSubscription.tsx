'use client';

import { trpc } from '@/utils/trpc';
import { useState } from 'react';

export function MessageSubscription() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ message: string; timestamp: number }[]>([]);

  trpc.onMessage.useSubscription(undefined, {
    onData(data) {
      setMessages((prev) => [...prev, data]);
    },
  });

  const mutation = trpc.sendMessage.useMutation();

  const sendMessage = () => {
    if (message.trim()) {
      mutation.mutate(message);
      setMessage('');
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="border p-2 mr-2 rounded"
          placeholder="Type a message..."
        />
        <button onClick={sendMessage} className="bg-blue-500 text-white px-4 py-2 rounded">
          Send
        </button>
      </div>
      <div className="space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className="bg-gray-100 p-2 rounded">
            <span>{msg.message}</span>
            <span className="text-xs text-gray-500 ml-2">{new Date(msg.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
