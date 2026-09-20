import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Par rótulo/valor em grade fixa — o corpo do inspector, do resumo do `/new` e das abas
 * do app.
 *
 * Existe para que dez lugares não colem `<dl>` à mão com alinhamentos diferentes. O
 * rótulo tem largura fixa justamente para que valores de linhas vizinhas alinhem.
 */
export function KeyValueList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn('m-0 flex flex-col gap-2', className)}>{children}</dl>;
}

export function KeyValue({
  label,
  children,
  mono = true,
  title,
}: {
  label: string;
  children: React.ReactNode;
  /** Valor de máquina (default). Texto livre passa `mono={false}`. */
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-x-4 max-md:grid-cols-[84px_minmax(0,1fr)]">
      <dt className="text-xs leading-[18px] text-text-3">{label}</dt>
      <dd
        title={title}
        className={cn(
          'm-0 min-w-0 text-text-1',
          mono ? 'font-mono tabular-nums text-xs leading-[18px] max-md:text-[13px]' : 'text-[13px] leading-5',
        )}
      >
        {children}
      </dd>
    </div>
  );
}
