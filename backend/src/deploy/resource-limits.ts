/**
 * Limites de memória e CPU por aplicação.
 *
 * ## Por que existe
 *
 * O `max_memory_restart` do PM2 estava fixo em `'1G'` para todo app gerado pelo painel,
 * e os containers subiam sem limite nenhum. Num servidor que hospeda 21 aplicações, um
 * vazamento de memória em uma delas consome a RAM da máquina inteira e o OOM killer do
 * Linux escolhe a vítima — que costuma ser o processo maior, não o culpado. Dar um teto
 * por app transforma "o servidor caiu" em "um app reiniciou".
 *
 * ## A diferença entre os dois runtimes é importante
 *
 * - **PM2** `max_memory_restart`: ao ultrapassar, o processo é **reiniciado**. O app
 *   volta sozinho e o efeito é uma interrupção curta.
 * - **Docker** `--memory`: ao ultrapassar, o kernel **mata** o container. Com
 *   `--restart unless-stopped` ele volta, mas a diferença aparece no log como OOMKilled.
 *
 * Por isso a UI avisa: o mesmo número não significa a mesma coisa nos dois lados, e um
 * limite apertado demais no Docker vira um ciclo de morte e reinício.
 *
 * Módulo puro, testável pelo `node --test`.
 */

/** Limites aceitos. Abaixo de 64MB nenhum processo Node sobe. */
export const MIN_MEMORY_MB = 64;
export const MAX_MEMORY_MB = 65536;
export const MIN_CPU = 0.1;
export const MAX_CPU = 64;

/** Valor usado quando o app não define nada — o mesmo que estava fixo no código. */
export const DEFAULT_PM2_MAX_MEMORY = '1G';

export function isValidMemoryMb(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_MEMORY_MB && value <= MAX_MEMORY_MB;
}

export function isValidCpuLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_CPU && value <= MAX_CPU;
}

/**
 * Valor de `max_memory_restart` para o ecosystem do PM2.
 *
 * O PM2 aceita sufixo `K`, `M` ou `G`. Usamos sempre `M` para evitar o arredondamento
 * de `1.5G`, que o PM2 não entende.
 */
export function pm2MaxMemory(maxMemoryMb: number | null | undefined): string {
  return isValidMemoryMb(maxMemoryMb) ? `${maxMemoryMb}M` : DEFAULT_PM2_MAX_MEMORY;
}

/**
 * Flags de limite para `docker run`.
 *
 * Sem limite configurado, devolve array vazio — o container segue com o comportamento
 * atual, sem teto. Mudar o padrão para um valor arbitrário derrubaria apps que hoje
 * usam mais do que ele.
 */
export function dockerLimitFlags(limits: {
  maxMemoryMb?: number | null;
  cpuLimit?: number | null;
}): string[] {
  const flags: string[] = [];

  if (isValidMemoryMb(limits.maxMemoryMb)) {
    flags.push(`--memory=${limits.maxMemoryMb}m`);
    // Sem `--memory-swap` igual à memória, o container ganha swap do mesmo tamanho de
    // brinde e o limite efetivo vira o dobro do configurado.
    flags.push(`--memory-swap=${limits.maxMemoryMb}m`);
  }

  if (isValidCpuLimit(limits.cpuLimit)) {
    // `--cpus` aceita fração: 0.5 = meio núcleo.
    flags.push(`--cpus=${limits.cpuLimit}`);
  }

  return flags;
}

/** Descrição legível para o log do deploy. */
export function describeLimits(limits: { maxMemoryMb?: number | null; cpuLimit?: number | null }): string {
  const partes: string[] = [];
  if (isValidMemoryMb(limits.maxMemoryMb)) partes.push(`${limits.maxMemoryMb}MB de RAM`);
  if (isValidCpuLimit(limits.cpuLimit)) partes.push(`${limits.cpuLimit} CPU`);
  return partes.length ? partes.join(', ') : 'sem limite configurado';
}

/** Normaliza o que a UI manda: `''` e `null` viram null, string numérica vira número. */
export function normalizeMemoryMb(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (!/^\d+$/.test(trimmed)) return value;
    return Number(trimmed);
  }
  return value;
}

export function normalizeCpuLimit(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(',', '.');
    if (trimmed === '') return null;
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return value;
    return Number(trimmed);
  }
  return value;
}
