import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Passos de um fluxo. Numerais sempre Mono `01/02/03`.
 *
 * Três anatomias porque uma faixa de 28px no celular não comporta alvo de 44px: lá o
 * stepper é indicador, não navegação.
 */

export interface Step {
  label: string;
  state: 'done' | 'active' | 'pending' | 'failed';
}

const numeral = (i: number) => String(i + 1).padStart(2, '0');

/** Horizontal — desktop e tablet. */
export function Stepper({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn('m-0 flex list-none items-center gap-3 p-0', className)}>
      {steps.map((step, i) => (
        <li key={step.label} className="flex min-w-0 flex-1 items-center gap-3 last:flex-none">
          <span className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'font-mono tabular-nums text-xs leading-4',
                step.state === 'active' ? 'text-accent' : 'text-text-3',
              )}
            >
              {numeral(i)}
            </span>
            <span
              className={cn(
                'whitespace-nowrap text-[13px] leading-5',
                step.state === 'active'
                  ? 'font-medium text-text-1'
                  : step.state === 'done'
                    ? 'text-text-2'
                    : 'text-text-3',
              )}
            >
              {step.label}
            </span>
            {step.state === 'done' && <Check className="h-3 w-3 text-accent" aria-hidden />}
          </span>
          {i < steps.length - 1 && <span aria-hidden className="h-px min-w-8 flex-1 bg-line-2" />}
        </li>
      ))}
    </ol>
  );
}

/**
 * Compacto — celular. Uma linha de texto e uma trilha de segmentos.
 *
 * O `<p>` abaixo diz em palavras o que a cor diz: sem ele a trilha é cor como único
 * sinal.
 */
export function StepperCompact({
  steps,
  current,
  hint,
}: {
  steps: Step[];
  current: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-baseline gap-2 text-[13px] leading-5 text-text-2">
        <span className="font-mono tabular-nums">
          {numeral(current)} de {numeral(steps.length - 1)}
        </span>
        <span aria-hidden>·</span>
        <span className="font-medium text-text-1">{steps[current]?.label}</span>
      </span>
      <span aria-hidden className="flex gap-1">
        {steps.map((step, i) => (
          <span
            key={step.label}
            className={cn(
              'block h-[3px] flex-1 rounded-full',
              step.state === 'failed'
                ? 'bg-red'
                : step.state === 'done' || step.state === 'active'
                  ? 'bg-accent'
                  : 'bg-line-2',
            )}
          />
        ))}
      </span>
      {hint && <p className="m-0 text-[13px] leading-5 text-text-2">{hint}</p>}
    </div>
  );
}

/** Vertical — pipeline do build, com duração por etapa. */
export function StepperVertical({ steps, className }: { steps: (Step & { duration?: string })[]; className?: string }) {
  return (
    <ol className={cn('m-0 flex list-none flex-col p-0', className)}>
      {steps.map((step, i) => (
        <li key={step.label} className="grid grid-cols-[16px_1fr_auto] items-start gap-x-3">
          <span className="flex h-full flex-col items-center gap-1">
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                step.state === 'done'
                  ? 'bg-accent-strong text-bg-0'
                  : step.state === 'failed'
                    ? 'bg-red text-bg-0'
                    : step.state === 'active'
                      ? 'border-2 border-accent'
                      : 'border border-line-3',
              )}
            >
              {step.state === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />}
            </span>
            {i < steps.length - 1 && <span aria-hidden className="block min-h-3 w-px flex-1 bg-line-2" />}
          </span>
          <span
            className={cn(
              'pb-4 text-[13px] leading-4',
              step.state === 'active' ? 'font-medium text-text-1' : 'text-text-2',
            )}
          >
            {step.label}
          </span>
          <span className="text-right font-mono tabular-nums text-2xs leading-4 text-text-3">
            {step.duration}
          </span>
        </li>
      ))}
    </ol>
  );
}
