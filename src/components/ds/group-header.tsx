import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AggregateDot, type Status } from './status';

/**
 * Faixa de projeto dentro da tabela.
 *
 * ## Uma única codificação de saúde
 *
 * O defeito nº 1 do QA foi codificar a saúde do grupo três vezes na mesma faixa
 * (contagem + tira de dots + fração colorida). Aqui:
 *
 * - o **dot agregado** assume o pior filho e é sempre preenchido;
 * - a **fração** `1/4 running` é neutra (Mono, text-2) — número, não alarme;
 * - a **gravidade** vem do badge com palavra e número (`3 stopped`), nunca de uma
 *   fração pintada de âmbar.
 *
 * Valores constantes do grupo (branch, package manager, release) moram só aqui e não se
 * repetem em cada linha. O botão com borda (`Start 3`) é o único da faixa: botão
 * bordeado não se repete por linha.
 */
export function GroupHeader({
  grid,
  name,
  status,
  fraction,
  badge,
  meta,
  actions,
  open,
  onToggle,
  controls,
}: {
  grid: string;
  name: string;
  /** Agregado dos filhos — use `aggregateStatus`. */
  status: Status;
  /** `1/4 running`. Neutro por definição. */
  fraction: string;
  badge?: React.ReactNode;
  /** `main · pnpm · release há 4d 3h`. Truncável, com `title`. */
  meta?: string;
  actions?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  /** id do rowgroup que esta faixa controla. */
  controls: string;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div
      role="row"
      className={cn('grid h-9 items-center gap-x-4 border-b border-line-1 bg-bg-1 pl-6 pr-3 max-xl:h-14 max-md:pl-4', grid)}
    >
      <div role="cell" className="col-[1/3] min-w-0">
        <h3 className="m-0 min-w-0 text-[13px] font-semibold leading-5">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={controls}
            onClick={onToggle}
            className="flex h-7 w-full min-w-0 items-center gap-4 text-left max-xl:h-11"
          >
            <span className="flex w-[66px] shrink-0 items-center text-text-3 max-md:w-5">
              <Chevron className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-2.5">
              <span className="whitespace-nowrap text-text-1">{name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <AggregateDot status={status} />
                <span className="whitespace-nowrap font-mono tabular-nums text-xs leading-[18px] text-text-2">
                  {fraction}
                </span>
              </span>
              {badge}
              {meta && (
                <>
                  <span aria-hidden className="block h-3 w-px shrink-0 bg-line-2 max-md:hidden" />
                  <span
                    title={meta}
                    className="min-w-0 truncate whitespace-nowrap font-mono tabular-nums text-2xs leading-4 text-text-3 max-md:hidden"
                  >
                    {meta}
                  </span>
                </>
              )}
            </span>
          </button>
        </h3>
      </div>
      {actions && (
        <span role="cell" className="flex items-center justify-end gap-1">
          {actions}
        </span>
      )}
    </div>
  );
}
