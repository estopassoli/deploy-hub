import { cn } from '@/lib/utils';

/**
 * Série pequena em linha.
 *
 * **Só desenhe quando existe série real.** O servidor não guarda histórico de
 * CPU/MEM/DISK global: ali o medidor sozinho responde, com a legenda "sem histórico".
 * Desenhar um sparkline liso a partir de um único ponto inventa uma tendência.
 */
export function Sparkline({
  points,
  w = 72,
  h = 16,
  tone = 'hsl(var(--brand))',
  label,
  className,
}: {
  /** Já em coordenadas do viewBox. */
  points: [number, number][];
  w?: number;
  h?: number;
  tone?: string;
  label: string;
  className?: string;
}) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
      className={cn('block shrink-0', className)}
    >
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke={tone}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2" fill={tone} />
    </svg>
  );
}

/**
 * Converte uma série bruta em coordenadas do viewBox.
 *
 * Mantida fora do componente para ser testável e para que a mesma série possa alimentar
 * o sparkline e a leitura numérica sem recalcular.
 */
export function toPoints(values: number[], w = 72, h = 16, max?: number): [number, number][] {
  if (values.length < 2) return [];
  const teto = max ?? Math.max(...values, 1);
  const passo = w / (values.length - 1);
  return values.map((v, i) => [
    Number((i * passo).toFixed(2)),
    Number((h - (Math.min(v, teto) / teto) * (h - 2) - 1).toFixed(2)),
  ]);
}
