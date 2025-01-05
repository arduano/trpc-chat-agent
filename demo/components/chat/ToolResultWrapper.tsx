import { Card } from '../ui/card';

interface ToolResultWrapperProps {
  icon: React.ReactNode;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function ToolResultWrapper({ icon, title, subtitle, children }: ToolResultWrapperProps) {
  return (
    <Card className="mt-2 p-4 border-none">
      <div className="flex items-start gap-3">
        <div className="mt-1">{icon}</div>
        <div className="flex-1">
          {(title || subtitle) && (
            <div>
              {subtitle && <div className="text-sm opacity-70">{subtitle}</div>}
              {title && <div className="font-semibold">{title}</div>}
            </div>
          )}
          {children}
        </div>
      </div>
    </Card>
  );
}
