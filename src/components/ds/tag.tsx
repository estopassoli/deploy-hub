import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tag neutra: framework (Next.js, NestJS, Vite), runtime (pm2, nginx, static),
 * proveniência (branch, hash).
 *
 * É a outra família do `Badge`. Badge é pílula de severidade com tinta semântica; Tag é
 * retângulo neutro com valor de máquina. Misturar as duas foi o defeito nº 4 do QA —
 * antes `nestjs` era `bg-destructive` (vermelho de erro como cor de framework) e
 * `vitejs` era `bg-purple-500`, fora dos tokens.
 *
 * `docker` é o único uso do violeta em todo o produto.
 */
export function Tag({
  tone = 'neutral',
  icon,
  title,
  className,
  children,
}: {
  tone?: 'neutral' | 'docker' | 'count';
  icon?: React.ReactNode;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] border px-1.5 font-mono tabular-nums text-2xs leading-none',
        'max-xl:h-6 max-md:text-xs',
        tone === 'docker' ? 'border-violet/28 bg-violet/12 text-violet' : 'border-line-2 bg-bg-2 text-text-2',
        tone === 'count' && 'h-[18px] min-w-[18px] justify-center rounded-full px-1.5',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
