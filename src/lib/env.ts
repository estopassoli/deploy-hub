/**
 * Leitura e escrita de arquivos `.env` no cliente.
 *
 * A lógica autoritativa — e testada — vive em `backend/src/deploy/env-diff.ts`, que é
 * quem decide o que exige rebuild na hora do deploy. Esta cópia existe porque o editor
 * precisa fazer o mesmo parsing **antes** de mandar qualquer coisa para a API, para
 * mostrar o diff e avisar sobre chave duplicada enquanto a pessoa digita. As duas
 * precisam concordar; se uma mudar, a outra muda junto.
 */

/** Prefixos embutidos no bundle em tempo de build (Next.js e Vite). */
export const BUILD_TIME_PREFIXES = ['NEXT_PUBLIC_', 'VITE_'];

export interface EnvEntry {
  key: string;
  value: string;
}

/** Nome de variável válido para shell: letra ou `_`, depois alfanumérico ou `_`. */
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidEnvKey(key: string): boolean {
  return ENV_KEY_PATTERN.test(key);
}

export function requiresRebuild(key: string): boolean {
  return BUILD_TIME_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Converte o texto de um `.env` em pares chave/valor, preservando a ordem.
 *
 * Linhas vazias e comentários são descartados — o editor é chave/valor, e manter
 * comentários exigiria um modelo de documento bem mais complicado. Quem precisa deles
 * usa a aba "Ver como texto".
 */
export function parseEnv(text: string | null | undefined): EnvEntry[] {
  if (!text) return [];

  const entries: EnvEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries.push({ key, value });
  }
  return entries;
}

/**
 * Serializa de volta para texto.
 *
 * Valores com espaço, `#` ou aspas saem entre aspas duplas: sem isso, um
 * `SENHA=minha senha` seria relido como `minha` na próxima abertura.
 */
export function serializeEnv(entries: EnvEntry[]): string {
  return entries
    .filter((entry) => entry.key.trim())
    .map((entry) => {
      const value = entry.value ?? '';
      const precisaAspas = /[\s#"']/.test(value);
      const escapado = value.replace(/"/g, '\\"');
      return `${entry.key.trim()}=${precisaAspas ? `"${escapado}"` : value}`;
    })
    .join('\n');
}

export interface EnvDiffResult {
  added: string[];
  removed: string[];
  changed: string[];
  buildRequired: string[];
  isEmpty: boolean;
}

export function diffEnv(before: string | null | undefined, after: string | null | undefined): EnvDiffResult {
  const antes = new Map(parseEnv(before).map((e) => [e.key, e.value]));
  const depois = new Map(parseEnv(after).map((e) => [e.key, e.value]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [key, value] of depois) {
    if (!antes.has(key)) added.push(key);
    else if (antes.get(key) !== value) changed.push(key);
  }
  for (const key of antes.keys()) {
    if (!depois.has(key)) removed.push(key);
  }

  added.sort();
  removed.sort();
  changed.sort();

  return {
    added,
    removed,
    changed,
    buildRequired: [...added, ...changed, ...removed].filter(requiresRebuild).sort(),
    isEmpty: !added.length && !removed.length && !changed.length,
  };
}

/** Chaves que aparecem mais de uma vez — a última venceria, silenciosamente. */
export function findDuplicateKeys(entries: EnvEntry[]): string[] {
  const vistos = new Set<string>();
  const duplicadas = new Set<string>();
  for (const { key } of entries) {
    const limpo = key.trim();
    if (!limpo) continue;
    if (vistos.has(limpo)) duplicadas.add(limpo);
    vistos.add(limpo);
  }
  return [...duplicadas];
}

/** Chaves com nome inválido para o shell. */
export function findInvalidKeys(entries: EnvEntry[]): string[] {
  return entries
    .map((entry) => entry.key.trim())
    .filter((key) => key.length > 0 && !isValidEnvKey(key));
}

/** Máscara para valor sensível, preservando o começo para dar contexto. */
export function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '•'.repeat(value.length);
  return `${value.slice(0, 2)}${'•'.repeat(Math.min(value.length - 2, 24))}`;
}
