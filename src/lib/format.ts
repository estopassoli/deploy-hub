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
export const PANEL_TIMEZONE = 'UTC';

/** Rótulo do fuso, usado no rodapé de todo feed. Trocar a constante troca os dois. */
export const PANEL_TZ_LABEL = 'horário do servidor (UTC)';

/**
 * Travessão: o valor **não se aplica** a este app — CPU de um site estático, uptime de
 * um app Stopped, memória de um processo que não existe.
 *
 * Quando uma célula fica em travessão, nada de medidor vazio nem sparkline ao lado.
 */
export const EM_DASH = '—';

/**
 * O backend **não grava** este campo. Aparece em prosa, nunca em coluna numérica, e
 * sempre acompanhado da explicação — nunca se inventa um número no lugar.
 */
export const SEM_DADOS = '[sem dados]';

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

// ── Números ────────────────────────────────────────────────────────────────────
//
// Vírgula decimal e ponto de milhar em tudo que a UI formata. Saída crua de `pm2 logs`
// e do terminal passa intocada — lá o ponto decimal é do programa, não nosso.

const num = (min: number, max = min) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });

const n0 = num(0);
const n1 = num(1);

type Maybe = number | null | undefined;
const isNum = (v: Maybe): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Percentual pt-BR com precisão fixa: `0,0%`, `64,0%`, `100,0%`.
 *
 * Precisão fixa por coluna é o ponto: a tabela nunca mistura "0%" com "0,4%". Ausente
 * vira travessão — e, quando vira, nenhum medidor ou sparkline é desenhado ao lado.
 */
export function formatPercent(value: Maybe, digits: 0 | 1 = 1): string {
  if (!isNum(value)) return EM_DASH;
  return `${num(digits).format(value)}%`;
}

/** Milhares com ponto: `1.284`, `215`. */
export function formatCount(value: Maybe): string {
  return isNum(value) ? n0.format(value) : EM_DASH;
}

/**
 * Tamanho em partes, para que a unidade seja pintada em text-3 separada do número.
 * `{ value: '407', unit: 'MB' }` · `{ value: '2,4', unit: 'GB' }`
 */
export function splitBytes(bytes: Maybe): { value: string; unit: string } | null {
  if (!isNum(bytes) || bytes < 0) return null;
  if (bytes < 1024) return { value: n0.format(bytes), unit: 'B' };
  const kb = bytes / 1024;
  if (kb < 1024) return { value: n0.format(Math.round(kb)), unit: 'KB' };
  const mb = kb / 1024;
  if (mb < 1024) return { value: n0.format(Math.round(mb)), unit: 'MB' };
  return { value: n1.format(mb / 1024), unit: 'GB' };
}

/** `407 MB`, `2,4 GB`. Para renderizar com a unidade dimmed, use `splitBytes`. */
export function formatBytes(bytes: Maybe): string {
  const p = splitBytes(bytes);
  return p ? `${p.value} ${p.unit}` : EM_DASH;
}

/** pm2 e a API devolvem memória já em MB. `formatMB(407)` → `407 MB`. */
export function formatMB(mb: Maybe): string {
  return isNum(mb) ? formatBytes(mb * 1024 * 1024) : EM_DASH;
}

const MINUTO = 60_000;
const HORA = 3_600_000;
const DIA = 86_400_000;

/**
 * Tempo relativo pt-BR, no máximo duas unidades: `agora`, `há 12s`, `há 1h 24m`,
 * `há 4d 3h`, `há 25d`.
 *
 * `units: 1` quando o relativo acompanha um timestamp absoluto na mesma linha
 * (`15 set 03:20 · há 5d`); `units: 2` (padrão) quando ele é o valor da célula.
 */
export function formatRelative(
  value: Date | string | number | null | undefined,
  opts: { units?: 1 | 2; now?: number } = {},
): string {
  const date = toDate(value);
  if (!date) return SEM_DADOS;

  const units = opts.units ?? 2;
  const diff = (opts.now ?? Date.now()) - date.getTime();
  if (diff < 10_000) return 'agora';
  if (diff < MINUTO) return `há ${Math.floor(diff / 1000)}s`;

  const pares: Array<[number, string, number, string]> = [
    [DIA, 'd', HORA, 'h'],
    [HORA, 'h', MINUTO, 'm'],
    [MINUTO, 'm', 1000, 's'],
  ];
  for (const [big, bigLabel, small, smallLabel] of pares) {
    if (diff < big) continue;
    const b = Math.floor(diff / big);
    const s = Math.floor((diff % big) / small);
    return units === 2 && s > 0 ? `há ${b}${bigLabel} ${s}${smallLabel}` : `há ${b}${bigLabel}`;
  }
  return 'agora';
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const partsFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: PANEL_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Absoluto, sempre em Mono, sempre no fuso do painel:
 * `hoje 04:05` · `ontem 12:30` · `15 set 03:20` · `15 set 2025 03:20`.
 *
 * Nunca imprime uma data que o parser não conseguiu ler — daí o SEM_DADOS.
 */
export function formatAbsolute(
  value: Date | string | number | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return SEM_DADOS;

  const get = (d: Date) => {
    const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, hm: `${p.hour}:${p.minute}` };
  };
  const a = get(date);
  const b = get(now);
  const dias = Math.round((Date.UTC(a.y, a.m, a.d) - Date.UTC(b.y, b.m, b.d)) / DIA);

  if (dias === 0) return `hoje ${a.hm}`;
  if (dias === -1) return `ontem ${a.hm}`;
  const mes = MESES[a.m - 1];
  return a.y === b.y ? `${a.d} ${mes} ${a.hm}` : `${a.d} ${mes} ${a.y} ${a.hm}`;
}
