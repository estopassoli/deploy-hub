import { cn } from '@/lib/utils';

/**
 * Ponto e palavra de status — um par indivisível.
 *
 * Cor nunca é o único sinal: em qualquer viewport o dot vem colado à palavra. Isso
 * substitui os seis jeitos diferentes de mostrar status que existiam (dot pulsante sem
 * palavra no AppCard, tradução para "rodando/parado" no AppCompactRow, badge sólido,
 * texto solto...).
 *
 * O vocabulário é fechado e usa os nomes que a API devolve. O tipo antigo do front era
 * `'running' | 'stopped' | 'error' | 'deploying'` enquanto a API responde `errored` —
 * era essa divergência que fazia o painel anunciar "Problemas 0" com apps fora do ar.
 */
export type Status = 'running' | 'stopped' | 'errored' | 'building' | 'failed' | 'ready';

const dot: Record<Status, string> = {
  running: 'bg-accent',
  stopped: 'border-[1.5px] border-text-3 box-border', // único anel vazado
  errored: 'bg-red',
  building: 'bg-amber',
  failed: 'bg-red',
  ready: 'bg-accent',
};

const word: Record<Status, string> = {
  running: 'font-normal text-text-3', // saudável recua
  stopped: 'font-medium text-text-1',
  errored: 'font-medium text-red',
  building: 'font-medium text-text-2',
  failed: 'font-medium text-red',
  ready: 'font-medium text-text-2',
};

const label: Record<Status, string> = {
  running: 'Running',
  stopped: 'Stopped',
  errored: 'Errored',
  building: 'Building',
  failed: 'Failed',
  ready: 'Ready',
};

export function statusLabel(status: Status): string {
  return label[status];
}

export function StatusDot({ status, size = 8 }: { status: Status; size?: 6 | 8 }) {
  return (
    <span
      aria-hidden
      className={cn('block shrink-0 rounded-full', dot[status], size === 6 ? 'h-1.5 w-1.5' : 'h-2 w-2')}
    />
  );
}

export function StatusLabel({ status }: { status: Status }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <StatusDot status={status} />
      <span className={cn('whitespace-nowrap text-[13px] leading-5 max-md:leading-[18px]', word[status])}>
        {label[status]}
      </span>
    </span>
  );
}

/**
 * Status de um grupo: assume o pior filho.
 *
 * `errored` vence `stopped`, que vence `running`. Usado na faixa de projeto e no dot do
 * projeto na sidebar — sempre preenchido, nunca o anel vazado da linha individual.
 */
export function aggregateStatus(children: Status[]): Status {
  if (children.some((s) => s === 'errored' || s === 'failed')) return 'errored';
  if (children.some((s) => s === 'building')) return 'building';
  if (children.some((s) => s === 'stopped')) return 'stopped';
  return 'running';
}

/** Dot agregado da faixa de grupo: preenchido mesmo quando o estado é `stopped`. */
export function AggregateDot({ status }: { status: Status }) {
  const fill =
    status === 'errored' || status === 'failed'
      ? 'bg-red'
      : status === 'stopped'
        ? 'bg-amber'
        : status === 'building'
          ? 'bg-amber'
          : 'bg-accent';
  return <span aria-hidden className={cn('block h-2 w-2 shrink-0 rounded-full', fill)} />;
}
