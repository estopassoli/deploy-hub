/**
 * Nomes, domínios e portas de um preview de branch.
 *
 * Um preview é um `App` normal, criado a partir de outro (o "pai"), com repositório,
 * tipo, comandos e env herdados. O que muda é o nome, o domínio e a porta — e é
 * exatamente onde mora a chance de colidir com um app de produção.
 *
 * Módulo puro, testável pelo `node --test`.
 */

/** Um rótulo de DNS tem no máximo 63 caracteres. */
const DNS_LABEL_MAX = 63;

/** `App.name` vira diretório, processo PM2, container e vhost — o mesmo padrão de sempre. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const NAME_MAX = 100;

/**
 * Converte um nome de branch em rótulo de DNS.
 *
 * `feat/login-social` → `feat-login-social`
 * `fix/BUG_123` → `fix-bug-123`
 *
 * Devolve `null` quando não sobra nada aproveitável — melhor recusar o preview do que
 * inventar um subdomínio que não corresponde à branch.
 */
export function branchToSlug(branch: string | null | undefined): string | null {
  if (!branch) return null;

  const slug = branch
    .toLowerCase()
    .normalize('NFD')
    // Remove acentos: `feat/configuração` viraria um rótulo inválido.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, DNS_LABEL_MAX)
    // O corte pode ter deixado um hífen no fim, que é inválido em rótulo de DNS.
    .replace(/-+$/g, '');

  if (!slug) return null;
  // Rótulo de DNS não pode começar com hífen nem ser só dígitos separados por hífen
  // que pareçam um IP; começar com letra ou dígito basta aqui.
  if (!/^[a-z0-9]/.test(slug)) return null;

  return slug;
}

/**
 * Nome do app de preview.
 *
 * Prefixo fixo `preview-` para que qualquer listagem — `pm2 list`, `docker ps`,
 * `ls ~/apps` — deixe óbvio o que é efêmero. O nome do pai vem junto para dar contexto.
 */
export function previewAppName(parentName: string, slug: string): string | null {
  const base = `preview-${parentName}-${slug}`
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_MAX)
    .replace(/-+$/g, '');

  return NAME_PATTERN.test(base) ? base : null;
}

/**
 * Domínio do preview: `<slug>.<domínio do pai>`.
 *
 * Exige DNS curinga (`*.meu-app.exemplo.com`) apontando para o servidor — o painel não
 * tem como criar esse registro, então a ausência dele aparece como preview inacessível.
 */
export function previewDomain(parentDomain: string | null | undefined, slug: string): string | null {
  if (!parentDomain) return null;

  const dominio = `${slug}.${parentDomain.trim().toLowerCase()}`;
  // Limite total de um FQDN.
  return dominio.length <= 253 ? dominio : null;
}

/**
 * A branch casa com o padrão configurado?
 *
 * Aceita uma lista separada por vírgula, com `*` como curinga: `feat/*,fix/*`.
 * Vazio significa **nenhuma** branch — preview não pode ser algo que começa a acontecer
 * sozinho só porque alguém fez push.
 */
export function branchMatchesPattern(branch: string, pattern: string | null | undefined): boolean {
  const padroes = (pattern || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (padroes.length === 0) return false;

  return padroes.some((padrao) => {
    const regex = new RegExp(
      `^${padrao
        .split('*')
        .map((parte) => parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
      'i',
    );
    return regex.test(branch);
  });
}

export interface PortRange {
  start: number;
  end: number;
}

/**
 * Interpreta `PREVIEW_PORT_RANGE` (ex.: `21000-21999`).
 *
 * Uma faixa dedicada é o que impede um preview de pegar a porta de um app de produção:
 * a alocação nunca sai daqui, e se a faixa lotar o preview falha em vez de procurar
 * porta em outro lugar.
 */
export function parsePortRange(raw: string | null | undefined, fallback: PortRange = { start: 21000, end: 21999 }): PortRange {
  const valor = (raw || '').trim();
  if (!valor) return fallback;

  const match = valor.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return fallback;

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);

  if (!Number.isInteger(start) || !Number.isInteger(end)) return fallback;
  if (start < 1024 || end > 65535 || start >= end) return fallback;

  return { start, end };
}

/**
 * Primeira porta livre dentro da faixa.
 *
 * Devolve `null` quando a faixa lotou — o chamador transforma isso num erro claro em
 * vez de alocar fora dela.
 */
export function allocatePort(range: PortRange, usedPorts: Iterable<number>): number | null {
  const usadas = new Set(usedPorts);
  for (let porta = range.start; porta <= range.end; porta++) {
    if (!usadas.has(porta)) return porta;
  }
  return null;
}

/** Previews sem push há mais de `ttlDays` — o gatilho de `delete` de branch pode nunca vir. */
export function expiredPreviews<T extends { updatedAt: Date; name: string }>(
  previews: T[],
  ttlDays: number,
  now: Date = new Date(),
): T[] {
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) return [];
  const corte = now.getTime() - ttlDays * 86_400_000;
  return previews.filter((preview) => preview.updatedAt.getTime() < corte);
}
