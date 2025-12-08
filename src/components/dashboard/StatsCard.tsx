import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatsCard({ title, value, subtitle, icon, trend, className }: StatsCardProps) {
  return (
    <div className={cn(
      'group relative overflow-hidden rounded-xl border border-border bg-card p-4 md:p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
      className
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">{title}</p>
          <p className="mt-1 md:mt-2 text-2xl md:text-3xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="mt-0.5 md:mt-1 text-xs md:text-sm text-muted-foreground truncate">{subtitle}</p>
          )}
          {trend && (
            <div className={cn(
              'mt-1 md:mt-2 inline-flex items-center gap-1 text-xs md:text-sm font-medium',
              trend.isPositive ? 'text-success' : 'text-destructive'
            )}>
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground hidden sm:inline">vs last week</span>
            </div>
          )}
        </div>
        <div className="flex h-10 w-10 md:h-12 md:w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
          {icon}
        </div>
      </div>
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-all duration-300 group-hover:bg-primary/10" />
    </div>
  );
}
