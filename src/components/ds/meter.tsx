import { cn } from '@/lib/utils';
import { formatPercent } from '@/lib/format';

/**
 * Medidor de recurso: trilho de 4px, preenchimento accent, âmbar em 70%, red em 90%.
 *
 * Acima de 70% a palavra **alto** aparece ao lado do número, porque cor não é sinal.
 * Os notches de 70/90 são duas bordas de 1px numa faixa logo abaixo do trilho: sem
 * eles o limiar é invisível e o âmbar parece arbitrário.
 *
 * Os limiares são definidos aqui uma vez e usados igual no medidor, no sparkline, no
 * mini-medidor da sidebar e no card do celular.
 */
export const WARN_AT = 70;
export const CRIT_AT = 90;

export function meterTone(value: number): string {
  return value >= CRIT_AT ? 'bg-red' : value >= WARN_AT ? 'bg-amber' : 'bg-accent-strong';
}

export function Meter({
  value,
  label,
  hint,
  className,
}: {
  value: number;
  label: string;
  hint?: string;
  className?: string;
}) {
  const wordTone = value >= CRIT_AT ? 'text-red' : 'text-amber';
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">{label}</span>
        <span className="flex-1" />
        <span className="font-mono tabular-nums text-xs leading-4 text-text-1">{formatPercent(value, 0)}</span>
        {value >= WARN_AT && <span className={cn('text-xs font-medium leading-4', wordTone)}>alto</span>}
      </div>
      <div
        role="img"
        aria-label={`${label} ${formatPercent(value, 0)} — alerta em ${WARN_AT}%, crítico em ${CRIT_AT}%`}
        className="flex flex-col gap-[3px]"
      >
        <span className="block h-1 overflow-hidden rounded-full bg-bg-3">
          <span
            className={cn('block h-1 rounded-full', meterTone(value))}
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          />
        </span>
        <span aria-hidden className="flex h-1">
          <span className="block w-[70%] border-r border-line-3" />
          <span className="block w-[20%] border-r border-line-3" />
        </span>
      </div>
      {hint && <span className="font-mono tabular-nums text-2xs leading-4 text-text-3">{hint}</span>}
    </div>
  );
}

/**
 * Versão de célula de tabela: número à direita numa largura fixa + barra de 48×4.
 *
 * Só em linha Running. Linha parada mostra travessão, nunca trilho vazio — um medidor
 * zerado ao lado de um app morto sugere uma medição que não existe.
 */
export function MicroMeter({
  value,
  unit,
  percent,
}: {
  /** Já formatado: `407`, `0,4`. */
  value: string;
  unit?: string;
  /** Preenchimento da barra, 0–100. */
  percent: number;
}) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="w-14 text-right font-mono tabular-nums text-xs leading-[18px] text-text-2">
        {value}
        {unit && <span className="text-2xs text-text-3"> {unit}</span>}
      </span>
      <span aria-hidden className="block h-1 w-12 shrink-0 overflow-hidden rounded-full bg-bg-3">
        <span
          className={cn('block h-1', meterTone(percent))}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </span>
    </span>
  );
}
