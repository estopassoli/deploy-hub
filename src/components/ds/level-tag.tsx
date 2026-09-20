import { cn } from '@/lib/utils';

/**
 * Nível de uma linha de log: INFO azul · WARN âmbar · ERROR red · OK accent.
 *
 * 16px de altura porque mora dentro de linhas de log de 20px; 18px com texto de 12px no
 * celular, que é o piso permitido para texto de badge no telefone.
 *
 * Tinta **com borda** — o preenchimento sem borda foi devolvido no QA por não se
 * separar do fundo em telas com pouco brilho.
 */
export type Level = 'INFO' | 'WARN' | 'ERROR' | 'OK';

const TONE: Record<Level, string> = {
  INFO: 'bg-blue/12 border-blue/28 text-blue',
  WARN: 'bg-amber/12 border-amber/28 text-amber',
  ERROR: 'bg-red/12 border-red/30 text-red',
  OK: 'bg-accent/12 border-accent/28 text-accent',
};

/** Traduz os níveis que o backend usa (`warn`, `error`, `info`, `success`). */
export function toLevel(raw: string | null | undefined): Level {
  switch ((raw || '').toLowerCase()) {
    case 'error':
    case 'fatal':
      return 'ERROR';
    case 'warn':
    case 'warning':
      return 'WARN';
    case 'success':
    case 'ok':
      return 'OK';
    default:
      return 'INFO';
  }
}

export function LevelTag({ level }: { level: Level }) {
  return (
    <span
      className={cn(
        'inline-flex h-4 shrink-0 items-center rounded-[4px] border px-[5px] font-mono tabular-nums text-2xs font-medium leading-none',
        'max-md:h-[18px] max-md:px-1.5 max-md:text-xs max-md:leading-none',
        TONE[level],
      )}
    >
      {level}
    </span>
  );
}
