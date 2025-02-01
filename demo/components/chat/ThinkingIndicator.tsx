export const ThinkingIndicator = () => (
  <div className="flex items-center gap-1 text-muted-foreground animate-pulse">
    <div>Thinking</div>
    <div className="flex gap-1">
      <div
        className="w-1 h-1 rounded-full bg-current animate-[bounce_1.4s_infinite]"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="w-1 h-1 rounded-full bg-current animate-[bounce_1.4s_infinite]"
        style={{ animationDelay: '0.2s' }}
      />
      <div
        className="w-1 h-1 rounded-full bg-current animate-[bounce_1.4s_infinite]"
        style={{ animationDelay: '0.4s' }}
      />
    </div>
  </div>
);
