import { cn } from '@/lib/utils';
import type { Status } from './status';

/**
 * Um tick de 4×14 por app, agrupado por projeto. Resume a frota inteira em ~96px.
 *
 * Cheio = running, anel vazado = stopped, red = errored — o mesmo vocabulário do
 * `StatusDot`, para que o tick e o dot da linha não signifiquem coisas diferentes.
 *
 * O `aria-label` já diz os números em palavras, e ao lado da faixa vive o texto
 * `17/21 · 3 stopped · 1 errored`: a tira é um reforço visual, nunca o único canal.
 */
export function FleetStrip({ groups }: { groups: Status[][] }) {
  const todos = groups.flat();
  const conta = (s: Status) => todos.filter((x) => x === s).length;

  const tick = (s: Status) =>
    s === 'errored' || s === 'failed'
      ? 'bg-red'
      : s === 'stopped'
        ? 'border border-text-3 box-border'
        : s === 'building'
          ? 'bg-amber'
          : 'bg-accent-strong';

  return (
    <div
      role="img"
      aria-label={`${conta('running')} running, ${conta('stopped')} stopped, ${conta('errored')} errored — agrupados por projeto`}
      className="flex items-center gap-1"
    >
      {groups.map((grupo, i) => (
        <span key={i} className="flex gap-0.5">
          {grupo.map((s, j) => (
            <span key={j} className={cn('block h-3.5 w-1 rounded-full', tick(s))} />
          ))}
        </span>
      ))}
    </div>
  );
}
