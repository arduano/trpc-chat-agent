'use client';

import { Chat } from '@/components/chat/Chat';
import { trpcClient } from '@/utils/trpc';
import { useParams, useRouter } from 'next/navigation';
import { RenderTool } from './RenderTool';

export default function Home() {
  const params = useParams();
  const id = params.chatId as string | undefined;

  const router = useRouter();

  return (
    <main className="h-screen bg-background">
      <Chat
        id={id}
        onUpdateConversationId={(id) => router.push(`/chat/${id}`)}
        router={trpcClient.chat}
        renderToolCall={(tool) => <RenderTool tool={tool} />}
      />
    </main>
  );
}
