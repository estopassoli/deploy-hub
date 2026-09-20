/**
 * Diferença entre dois arquivos `.env` e o que ela implica para o deploy.
 *
 * ## Para que serve
 *
 * Trocar `DATABASE_URL` ou `REDIS_URL` não exige rebuild: o processo lê a variável em
 * runtime, então reescrever o `.env` e reiniciar basta — segundos em vez dos minutos de
 * um deploy inteiro.
 *
 * Só que isso **não** vale para todas as chaves. Next.js e Vite embutem as variáveis
 * com prefixo público no bundle **em tempo de build**:
 *
 *   - `NEXT_PUBLIC_*` (Next.js)
 *   - `VITE_*` (Vite)
 *
 * Mudar uma delas e só reiniciar não muda nada no que o navegador recebe — o valor
 * antigo continua dentro do JavaScript já compilado. O sintoma é péssimo de diagnosticar:
 * o painel diz que salvou, o processo reiniciou, e o frontend segue apontando para a API
 * antiga. Por isso o diff separa essas chaves e a UI oferece "Salvar e fazer redeploy".
 *
 * Módulo puro, testável pelo `node --test`.
 */

/** Prefixos cujo valor é embutido no bundle durante o build. */
export const BUILD_TIME_PREFIXES = ['NEXT_PUBLIC_', 'VITE_'] as const;

export interface EnvDiff {
  added: string[];
  removed: string[];
  changed: string[];
  /** Chaves alteradas que exigem rebuild para ter efeito. */
  buildRequired: string[];
  /** True quando nada mudou. */
  isEmpty: boolean;
}

/**
 * Converte o texto de um `.env` em mapa.
 *
 * Mesma leitura que o pipeline de deploy já faz: ignora linha vazia e comentário,
 * separa no primeiro `=` e tira aspas envolventes.
 */
export function parseEnvText(text: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) return result;

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
    result[key] = value;
  }

  return result;
}

export function requiresRebuild(key: string): boolean {
  return BUILD_TIME_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function diffEnv(before: string | null | undefined, after: string | null | undefined): EnvDiff {
  const antes = parseEnvText(before);
  const depois = parseEnvText(after);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of Object.keys(depois)) {
    if (!(key in antes)) added.push(key);
    else if (antes[key] !== depois[key]) changed.push(key);
  }
  for (const key of Object.keys(antes)) {
    if (!(key in depois)) removed.push(key);
  }

  added.sort();
  removed.sort();
  changed.sort();

  const buildRequired = [...added, ...changed, ...removed].filter(requiresRebuild).sort();

  return {
    added,
    removed,
    changed,
    buildRequired,
    isEmpty: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

/** Resumo legível para o log do deploy e para o toast da UI. */
export function describeEnvDiff(diff: EnvDiff): string {
  if (diff.isEmpty) return 'nenhuma variável mudou';

  const partes: string[] = [];
  if (diff.added.length) partes.push(`${diff.added.length} adicionada(s)`);
  if (diff.changed.length) partes.push(`${diff.changed.length} alterada(s)`);
  if (diff.removed.length) partes.push(`${diff.removed.length} removida(s)`);
  return partes.join(', ');
}
