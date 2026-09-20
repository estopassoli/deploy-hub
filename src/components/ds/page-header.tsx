import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Cabeçalho de página. Antes cada página montava o seu à mão, e quatro deles quebravam
 * em tablet/celular.
 *
 * O `h1` é o título da rota — um por página. No celular ele continua sendo o `h1` da
 * página, não o texto do top bar.
 *
 * `meta` é uma linha só, separada por `·`. Quando o conteúdo é longo demais para uma
 * linha no tablet, ele quebra — nunca vira scroll horizontal.
 */
export function PageHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-start gap-4 max-md:flex-col max-md:gap-3', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="m-0 text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">{title}</h1>
        {meta && (
          <div className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-text-3">
            {meta}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:flex-wrap">{actions}</div>
      )}
    </header>
  );
}

/** Separador de meta. Existe como componente para nunca virar texto selecionável. */
export function MetaDot() {
  return <span aria-hidden>·</span>;
}
