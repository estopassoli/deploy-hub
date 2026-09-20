import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Faixa de saúde do servidor: até 5 células numa faixa de no máximo 72px.
 *
 * Substitui a fileira de quatro `StatsCard`, que gastava 137px de altura para mostrar
 * quatro números — e cada card ainda trazia ícone em quadrado tingido e blob com blur,
 * três padrões proibidos de uma vez.
 */
export function HealthStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-5 items-stretch gap-x-6 rounded-[8px] border border-line-2 bg-bg-1 px-4 py-3',
        'max-xl:grid-cols-3 max-xl:gap-y-4 max-md:grid-cols-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HealthCell({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <span className="text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">{label}</span>
      {children}
      {hint && <span className="truncate font-mono tabular-nums text-2xs leading-4 text-text-3">{hint}</span>}
    </div>
  );
}
