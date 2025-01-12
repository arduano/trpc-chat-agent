'use client';

import { Chat } from '@/app/chat/Chat';
import { useParams, useRouter } from 'next/navigation';

export default function Home() {
  const params = useParams();
  const id = params.chatId as string | undefined;

  const router = useRouter();

  return (
    <main className="h-screen bg-background">
      <Chat id={id} onUpdateConversationId={(id) => router.push(`/chat/${id}`)} />
    </main>
  );
}
