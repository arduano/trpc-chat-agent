'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { trpc } from '@/utils/trpc';
import { useState } from 'react';

export function ChatComponent() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ message: string; timestamp: number; isMe?: boolean }[]>([
    { message: 'Hey there!', timestamp: Date.now() - 50000, isMe: false },
    { message: 'Hi! How are you?', timestamp: Date.now() - 40000, isMe: true },
    { message: "I'm doing great, thanks for asking!", timestamp: Date.now() - 30000, isMe: false },
    { message: 'What have you been up to?', timestamp: Date.now() - 20000, isMe: true },
  ]);

  trpc.onMessage.useSubscription(undefined, {
    onData(data) {
      setMessages((prev) => [...prev, { ...data, isMe: false }]);
    },
  });

  const mutation = trpc.sendMessage.useMutation();

  const sendMessage = () => {
    if (message.trim()) {
      const newMessage = {
        message: message.trim(),
        timestamp: Date.now(),
        isMe: true,
      };
      setMessages((prev) => [...prev, newMessage]);
      mutation.mutate(message);
      setMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <Card className="flex-1 border-0 rounded-none shadow-none relative">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 p-4">
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex', msg.isMe ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[70%] px-4 py-3 rounded-md',
                    msg.isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  )}
                >
                  <div className="break-words">{msg.message}</div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      <Card className="border-t rounded-none p-4">
        <div className="flex gap-4 max-w-4xl mx-auto">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type a message..."
            className="resize-none"
            rows={1}
          />
          <Button onClick={sendMessage} size="lg">
            Send
          </Button>
        </div>
      </Card>
    </div>
  );
}
