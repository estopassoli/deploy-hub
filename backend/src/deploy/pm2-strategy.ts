/**
 * Decide entre recriar o processo no PM2 ou recarregá-lo.
 *
 * ## O problema
 *
 * Todo deploy fazia `pm2 delete <app>` seguido de `pm2 start <ecosystem>`. Entre os
 * dois comandos existe uma janela em que **não há processo algum** ouvindo na porta: o
 * nginx recebe requisição, tenta o proxy para 127.0.0.1:<porta>, ninguém atende, e o
 * usuário vê 502. Para um app que demora alguns segundos para subir, essa janela é o
 * tempo de boot inteiro.
 *
 * `pm2 startOrReload <ecosystem> --update-env` inicia se não existir e recarrega se
 * existir, sem passar por "processo removido". Em modo fork ainda há um reinício, mas o
 * PM2 controla a substituição e a entrada nunca some da lista.
 *
 * ## Quando ainda é preciso recriar
 *
 * O reload reaproveita a definição do processo. Se o que mudou for a **identidade** dele
 * — script, cwd, interpretador ou argumentos — reaproveitar significaria continuar
 * rodando a definição antiga. Os casos reais: um app que troca de `nextjs` para
 * `nestjs`, um monorepo que muda de `appDir`, ou um app que sai do Docker e volta para
 * o PM2. Nesses, delete + start é o correto.
 *
 * Módulo puro, testável pelo `node --test`.
 */

export type Pm2Strategy = 'reload' | 'recreate';

/** Campos que definem a identidade do processo dentro do ecosystem gerado. */
const IDENTITY_FIELDS = ['name', 'script', 'args', 'cwd', 'interpreter'] as const;

/**
 * Extrai os campos de identidade de um ecosystem.config.js gerado por este projeto.
 *
 * Não é um parser de JavaScript: lê as linhas `campo: valor` que `generatePM2Config`
 * emite, que é um formato que nós mesmos controlamos.
 */
export function extractIdentity(config: string | null | undefined): Record<string, string> {
  const identity: Record<string, string> = {};
  if (!config) return identity;

  for (const field of IDENTITY_FIELDS) {
    const match = config.match(new RegExp(`^\\s*${field}:\\s*(.+?),?\\s*$`, 'm'));
    if (match) identity[field] = match[1].trim();
  }

  return identity;
}

/**
 * `reload` quando o processo já existe e a identidade não mudou; `recreate` caso
 * contrário.
 *
 * `processExists` vem do `pm2 jlist`: sem processo, não há o que recarregar.
 */
export function decidePm2Strategy(options: {
  processExists: boolean;
  previousConfig: string | null | undefined;
  nextConfig: string;
  /** Runtime da última vez. Sair de docker/static exige recriar. */
  previousRuntime?: string | null;
}): Pm2Strategy {
  if (!options.processExists) return 'recreate';
  if (options.previousRuntime && options.previousRuntime !== 'pm2') return 'recreate';
  if (!options.previousConfig) return 'recreate';

  const antes = extractIdentity(options.previousConfig);
  const depois = extractIdentity(options.nextConfig);

  // Sem conseguir ler a identidade de algum dos lados, recriar é o lado seguro.
  if (Object.keys(antes).length === 0 || Object.keys(depois).length === 0) return 'recreate';

  for (const field of IDENTITY_FIELDS) {
    if (antes[field] !== depois[field]) return 'recreate';
  }

  return 'reload';
}
