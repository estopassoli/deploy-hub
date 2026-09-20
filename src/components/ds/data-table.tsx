import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabela de dados do produto.
 *
 * ## Por que não é `<table>` nem `ui/table.tsx`
 *
 * A tabela do painel tem faixa de grupo entre as linhas, coluna de ações de largura
 * fixa e uma linha que muda de anatomia conforme o estado (app parado troca as três
 * células numéricas por "motivo · fonte · quando"). Isso não cabe em `<table>` com
 * `p-4` por célula — daí a grade CSS com o conjunto ARIA completo.
 *
 * ## O contrato
 *
 * - **Uma grade por tabela**, compartilhada por cabeçalho, faixa de grupo e linhas.
 *   Passe a mesma classe `grid-cols-[...]` em todos.
 * - Cabeçalho 36px, linhas 44px, faixa 36px, rodapé 40px.
 * - Coluna Ações de largura fixa (92px = 3×28 + 2×4) que **nunca** substitui uma
 *   célula de dado — ação não pode ocupar o lugar de informação.
 * - Seleção é `bg-bg-3` + pílula de 2×20. Nada de cartão com borda esquerda colorida.
 * - `role="row"` sem `cell` é proibido: anuncia pior do que não ter tabela. O painel
 *   tinha 22 `role="row"` e nenhum `columnheader`.
 *
 * No tablet as linhas vão a 56px com duas linhas por célula e as colunas de prioridade
 * 4 caem. **Nunca rolagem horizontal.**
 */

/** Classe do cabeçalho de coluna. Exportada porque as telas montam as suas. */
export const TH = 'text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3';

export function DataTable({
  label,
  labelledBy,
  children,
  className,
}: {
  /** Nome acessível quando não há um `h2` visível para apontar. */
  label?: string;
  labelledBy?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="table" aria-label={label} aria-labelledby={labelledBy} className={cn('flex flex-col', className)}>
      {children}
    </div>
  );
}

export function TableHead({ grid, children }: { grid: string; children: React.ReactNode }) {
  return (
    <div role="rowgroup">
      <div
        role="row"
        className={cn(
          'grid h-9 items-center gap-x-4 border-b border-line-2 pl-6 pr-3',
          'max-xl:h-10 max-md:hidden',
          grid,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function TableRowGroup({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div role="rowgroup" id={id}>
      {children}
    </div>
  );
}

export function TableRow({
  grid,
  selected,
  className,
  children,
}: {
  grid: string;
  selected?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="row"
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative grid h-11 items-center gap-x-4 border-b border-line-1 pl-6 pr-3 transition-colors',
        'max-xl:h-14 max-md:h-16 max-md:pl-4 max-md:pr-2',
        selected ? 'bg-bg-3' : 'hover:bg-bg-2',
        grid,
        className,
      )}
    >
      {selected && (
        <span aria-hidden className="absolute left-0 top-3 block h-5 w-0.5 rounded-full bg-accent" />
      )}
      {children}
    </div>
  );
}

/** Célula numérica: Mono, tabular, à direita, unidade em text-3 separada por espaço. */
export function NumCell({
  value,
  unit,
  title,
  className,
}: {
  value: React.ReactNode;
  unit?: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      role="cell"
      title={title}
      className={cn('font-mono tabular-nums text-xs leading-[18px] text-right text-text-2', className)}
    >
      {value}
      {unit && <span className="text-2xs text-text-3"> {unit}</span>}
    </span>
  );
}

/**
 * Rodapé com a legenda de teclado. Só aparece no desktop: `Kbd` não existe no toque.
 */
export function TableFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-10 items-center gap-4 border-t border-line-1 px-6 max-xl:hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}
