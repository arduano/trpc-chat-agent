'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  // Redirect to /chat

  const router = useRouter();

  useEffect(() => {
    router.push('/chat');
  }, [router]);

  return <div></div>;
}
