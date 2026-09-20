/**
 * Formatação compartilhada de data, hora e texto de log.
 */

/**
 * Fuso fixo do painel.
 *
 * Os horários apareciam inconsistentes: a coluna de hora era renderizada com
 * `toLocaleTimeString()` — ou seja, no fuso de quem está olhando — enquanto a mensagem
 * do log trazia o horário que o próprio app imprimiu, quase sempre em UTC. Dava para
 * ver 01:13 na coluna e 04:13 na mesma linha.
 *
 * Fixar o fuso faz a coluna significar sempre a mesma coisa, independente da máquina
 * de quem abre o painel.
 */
export const PANEL_TIMEZONE = 'America/Sao_Paulo';

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: PANEL_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: PANEL_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `14:32:05` no fuso do painel, ou `--:--:--` para valor inválido. */
export function formatTime(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : '--:--:--';
}

/** `20/09/2026 14:32` no fuso do painel, ou `-` para valor inválido. */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : '-';
}

/** Duração legível: `820ms`, `45s`, `1m 12s`, `1h 5m`. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return (seconds ? `${minutes}m ${seconds}s` : `${minutes}m`);

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Duração entre dois instantes, tolerando valores ausentes. */
export function formatElapsed(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string {
  const inicio = toDate(start);
  const fim = toDate(end);
  if (!inicio || !fim) return '-';
  return formatDuration(fim.getTime() - inicio.getTime());
}

/**
 * Remove sequências de escape ANSI do texto de log.
 *
 * O stream vem do `pm2 logs`, que repassa a saída dos apps sem tratar nada — então
 * chegavam coisas como `\u001b[32m✓\u001b[39m` cruas na tela.
 *
 * A escolha aqui é **remover** em vez de converter para HTML colorido. Converter
 * exigiria injetar HTML gerado a partir da saída de aplicações de terceiros; mesmo com
 * sanitização, é uma superfície de XSS que um painel que também oferece shell root não
 * precisa ter. Legibilidade resolvida, risco zero.
 */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-nqry=><]/g;

export function stripAnsi(text: string | null | undefined): string {
  if (typeof text !== 'string') return '';
  return text.replace(ANSI_PATTERN, '');
}
