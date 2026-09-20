import type { Status } from '@/components/ds/status';

/**
 * Traduz o status que a API devolve para o vocabulário do kit.
 *
 * ## O bug que isto fecha
 *
 * O tipo do front era `'running' | 'stopped' | 'error' | 'deploying'`, mas a API
 * responde `errored` e `building`. Nada comparava direito: o card "Problemas" contava
 * `status === 'error'` e dava **0** num painel com quatro apps fora do ar.
 *
 * Aceitar os dois vocabulários aqui, num lugar só, é o que impede a divergência de
 * voltar pela porta dos fundos quando o backend mudar uma palavra.
 */
export function toStatus(raw: string | null | undefined): Status {
  switch ((raw || '').toLowerCase()) {
    case 'running':
    case 'online':
      return 'running';
    case 'error':
    case 'errored':
    case 'crashed':
      return 'errored';
    case 'deploying':
    case 'building':
      return 'building';
    case 'failed':
      return 'failed';
    case 'ready':
      return 'ready';
    default:
      return 'stopped';
  }
}

/** Um app com problema é o que exige ação: fora do ar ou quebrado. */
export function hasProblem(status: Status): boolean {
  return status === 'errored' || status === 'failed' || status === 'stopped';
}

/**
 * Ordena "problemas primeiro".
 *
 * Um painel com 21 apps em ordem alfabética esconde os quatro que importam. A ordem é
 * errored → failed → stopped → building → running e, dentro de cada grupo, alfabética.
 */
const PESO: Record<Status, number> = {
  errored: 0,
  failed: 1,
  stopped: 2,
  building: 3,
  ready: 4,
  running: 5,
};

export function byProblemFirst<T extends { status: Status; name: string }>(a: T, b: T): number {
  const d = PESO[a.status] - PESO[b.status];
  return d !== 0 ? d : a.name.localeCompare(b.name, 'pt-BR');
}

/** Rótulo da terceira ação da linha, que depende do estado. */
export function primaryAction(status: Status): 'Redeploy' | 'Start' | 'Restart' {
  if (status === 'running' || status === 'ready') return 'Redeploy';
  if (status === 'errored' || status === 'failed') return 'Restart';
  return 'Start';
}
