import { LogEntry } from '@/types/app';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RecentActivityProps {
  logs: LogEntry[];
}

const levelStyles = {
  info: 'text-cyan-400',
  warn: 'text-warning',
  error: 'text-destructive',
  debug: 'text-muted-foreground',
};

export function RecentActivity({ logs }: RecentActivityProps) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-semibold text-foreground">Recent Activity</h3>
        <span className="text-xs text-muted-foreground">Last 24h</span>
      </div>
      <ScrollArea className="h-[320px]">
        <div className="p-4 space-y-2">
          {logs.map((log, index) => (
            <div 
              key={log.id} 
              className={cn(
                'rounded-lg bg-secondary/50 p-3 font-mono text-xs opacity-0 animate-slide-in',
                `stagger-${Math.min(index + 1, 5)}`
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-muted-foreground">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={cn('font-semibold uppercase', levelStyles[log.level])}>
                  [{log.level}]
                </span>
                {log.source && (
                  <span className="text-primary/70">{log.source}</span>
                )}
              </div>
              <p className="text-foreground/90 break-all">{log.message}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
