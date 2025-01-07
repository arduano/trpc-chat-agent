import type { ChatPathStateWithSwitch } from '@trpc-chat-agent/core';
import { Button } from '../ui/button';

export function MessageVariants({ path }: { path: ChatPathStateWithSwitch }) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
      {Array.from({ length: path.count }, (_, i) => (
        <Button
          key={i}
          onClick={() => path.switchTo(i)}
          variant={path.index === i ? 'secondary' : 'ghost'}
          size="sm"
          className="w-5 h-5 p-0"
        >
          {i + 1}
        </Button>
      ))}
    </div>
  );
}
