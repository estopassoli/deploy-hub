import { cn } from '@/lib/utils';

interface UsageChartProps {
  label: string;
  value: number;
  color: 'primary' | 'cyan' | 'warning' | 'destructive';
  subtitle?: string;
}

const colorMap = {
  primary: 'bg-primary',
  cyan: 'bg-cyan-400',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};

export function UsageChart({ label, value, color, subtitle }: UsageChartProps) {
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    // O gauge tinha largura fixa de 112px; três deles lado a lado não cabiam no card
    // lateral em telas médias, e o terceiro ("Disco") aparecia cortado. Agora encolhem
    // junto com o container e nunca passam de 7rem.
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className="relative aspect-square w-full max-w-[7rem]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-secondary"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            className={cn(
              'transition-all duration-1000 ease-out',
              color === 'primary' && 'text-primary',
              color === 'cyan' && 'text-cyan-400',
              color === 'warning' && 'text-warning',
              color === 'destructive' && 'text-destructive'
            )}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl sm:text-2xl font-bold text-foreground">{value}%</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">{label}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
