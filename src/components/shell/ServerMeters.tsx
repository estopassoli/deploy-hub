import { cn } from '@/lib/utils';
import { EM_DASH, formatPercent } from '@/lib/format';
import { CRIT_AT, WARN_AT, meterTone } from '@/components/ds/meter';

/**
 * CPU / MEM / DISK no rodapé da sidebar.
 *
 * Três linhas de 16px com entalhes em 70% e 90%. Acima de 70% a barra vira âmbar **e**
 * o valor ganha a palavra `alto` — o painel mostrava DISK 72% só como um número âmbar,
 * que é cor como único sinal.
 *
 * Sem dado, travessão. Nunca `0%`: zero é uma medição, ausência não é.
 */
export function ServerMeters({
  cpu,
  memory,
  disk,
}: {
  cpu?: number | null;
  memory?: number | null;
  disk?: number | null;
}) {
  const linhas: [string, number | null | undefined][] = [
    ['CPU', cpu],
    ['MEM', memory],
    ['DISK', disk],
  ];

  return (
    <div className="flex flex-col gap-1.5 border-t border-line-1 px-5 py-3">
      {linhas.map(([rotulo, valor]) => {
        const tem = typeof valor === 'number' && Number.isFinite(valor);
        const alto = tem && (valor as number) >= WARN_AT;
        return (
          <div key={rotulo} className="grid h-4 grid-cols-[30px_1fr_auto] items-center gap-x-2.5">
            <span className="font-mono tabular-nums text-2xs leading-4 text-text-3">{rotulo}</span>
            {tem ? (
              <span
                role="img"
                aria-label={`${rotulo} ${formatPercent(valor, 0)}${alto ? ', alto' : ''} — alerta em ${WARN_AT}%, crítico em ${CRIT_AT}%`}
                className="relative block h-[3px] overflow-hidden rounded-full bg-bg-3"
              >
                <span
                  className={cn('block h-[3px] rounded-full', meterTone(valor as number))}
                  style={{ width: `${Math.min(100, valor as number)}%` }}
                />
                <span aria-hidden className="absolute inset-y-0 left-[70%] w-px bg-line-3" />
                <span aria-hidden className="absolute inset-y-0 left-[90%] w-px bg-line-3" />
              </span>
            ) : (
              <span className="block h-[3px] rounded-full bg-bg-3" aria-hidden />
            )}
            <span className="flex items-baseline gap-1">
              <span className="font-mono tabular-nums text-2xs leading-4 text-text-2">
                {tem ? formatPercent(valor, 0) : EM_DASH}
              </span>
              {alto && (
                <span
                  className={cn(
                    'text-2xs font-medium leading-4',
                    (valor as number) >= CRIT_AT ? 'text-red' : 'text-amber',
                  )}
                >
                  alto
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
