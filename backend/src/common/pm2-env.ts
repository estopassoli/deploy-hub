/**
 * Ambiente com que os comandos `pm2` são invocados.
 *
 * ## O problema
 *
 * `pm2 startOrReload <ecosystem> --update-env` e `pm2 restart <app> --update-env`
 * mandam o PM2 reler o ambiente. O ambiente que ele relê é o do processo que
 * chamou o `pm2` — ou seja, o backend do DeployHub. Como o Nest carrega o `.env`
 * do painel em `process.env`, as variáveis **do painel** vazavam para dentro de
 * todo app gerenciado:
 *
 *     DATABASE_URL=file:./prisma/deployhub.db   → o SQLite do painel
 *     PORT=10001                                → a porta do painel
 *
 * Em 22/09/2026 isso derrubou o agendaexpert. Os processos Next subiram
 * apontando para o banco do painel e devolviam `Invalid DATABASE_URL format` em
 * toda requisição (o site inteiro em HTTP 500); o quarto processo morreu em loop
 * de restart com `EADDRINUSE :::10001`, porque tentava subir na porta do próprio
 * painel em vez da sua. Cada redeploy reaplicava o vazamento, então tentar
 * "subir a versão nova" derrubava o app de novo.
 *
 * ## A correção
 *
 * Um app gerenciado não precisa de nada do painel: o ecosystem gerado por
 * `generatePM2Config` já traz `NODE_ENV`, `PORT`, `PATH` e o env do usuário. O
 * `pm2` passa então a ser invocado com o ambiente do painel **menos** o que é do
 * painel: as chaves declaradas no `.env` dele, um piso fixo para o caso do
 * arquivo não estar legível, e a escrituração que o próprio PM2 injeta no
 * processo que ele supervisiona.
 *
 * Módulo puro (fora de `pm2Env`), testável pelo `node --test`.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Piso fixo: chaves do painel que nunca devem chegar a um app gerenciado, mesmo
 * que o `.env` não seja legível. `DATABASE_URL` e `PORT` são as que causaram o
 * incidente; o resto é credencial do painel que não tem por que vazar.
 */
export const DEPLOYHUB_OWN_KEYS = [
  'DATABASE_URL',
  'PORT',
  'NODE_ENV',
  'JWT_SECRET',
  'APPS_DIR',
  'REGISTRATION_SECRET',
  'WEBHOOK_SECRET',
  'API_URL',
  'SSH_HOST',
  'SSH_USER',
  'ENV_ENCRYPTION_KEY',
  'CORS_ORIGINS',
  'RESEND_API_KEY',
  'VITE_API_URL',
];

/**
 * Escrituração que o PM2 injeta no processo supervisionado (o backend do painel
 * roda sob PM2). Repassar isso para um app novo descreve o processo errado.
 *
 * `PM2_HOME` e `PM2_USAGE` ficam de fora da lista de propósito: são o que o CLI
 * do `pm2` usa para achar o daemon certo.
 */
export const PM2_BOOKKEEPING_KEYS = [
  'name',
  'namespace',
  'version',
  'vizion',
  'autorestart',
  'watch',
  'instances',
  'exec_mode',
  'exec_interpreter',
  'instance_var',
  'node_args',
  'node_version',
  'merge_logs',
  'treekill',
  'windowsHide',
  'username',
  'status',
  'unique_id',
  'created_at',
  'restart_time',
  'unstable_restarts',
  'prev_restart_delay',
  'exit_code',
  'km_link',
  'NODE_APP_INSTANCE',
];

/** Prefixos da mesma escrituração: `pm_id`, `pm_cwd`, `axm_options`, ... */
const PM2_BOOKKEEPING_PREFIXES = ['pm_', 'axm_'];

function isPm2Bookkeeping(key: string): boolean {
  if (PM2_BOOKKEEPING_KEYS.includes(key)) return true;
  return PM2_BOOKKEEPING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Nomes de variável declarados num arquivo `.env`.
 *
 * Não é um parser de dotenv completo: só precisa dos **nomes** para montar a
 * lista de exclusão, então lê `CHAVE=` no início de cada linha e ignora
 * comentários, linhas vazias e o `export ` opcional.
 */
export function parseEnvKeys(contents: string): string[] {
  const keys: string[] = [];

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && !keys.includes(match[1])) keys.push(match[1]);
  }

  return keys;
}

/**
 * `source` sem as chaves do painel nem a escrituração do PM2.
 *
 * `extraKeys` são as chaves lidas do `.env` do painel — variam por instalação,
 * então entram por parâmetro em vez de virarem constante.
 */
export function sanitizePm2Env(
  source: NodeJS.ProcessEnv,
  extraKeys: string[] = [],
): NodeJS.ProcessEnv {
  const remover = new Set([...DEPLOYHUB_OWN_KEYS, ...extraKeys]);
  const limpo: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(source)) {
    if (remover.has(key)) continue;
    if (isPm2Bookkeeping(key)) continue;
    limpo[key] = value;
  }

  return limpo;
}

/**
 * Caminho do `.env` do painel.
 *
 * Em CommonJS — o que `nest build` emite — `__dirname` é `<backend>/dist/common`,
 * então dois níveis acima é a raiz do backend. O `node --test` carrega o `.ts`
 * direto como ESM, onde `__dirname` não existe; aí vale o cwd, que é de onde o
 * backend roda. `typeof` numa variável não declarada não lança.
 */
function dotenvPath(): string {
  const raiz = typeof __dirname === 'string' ? path.resolve(__dirname, '..', '..') : process.cwd();
  return path.join(raiz, '.env');
}

let cache: NodeJS.ProcessEnv | null = null;

/**
 * O ambiente a passar em `run('pm2', ..., { env: pm2Env() })`.
 *
 * Lê o `.env` do painel uma vez por processo: o arquivo não muda sem um restart
 * do backend, que é o que recarregaria o `process.env` de qualquer forma.
 */
export function pm2Env(): NodeJS.ProcessEnv {
  if (cache) return cache;

  let declaradas: string[] = [];
  try {
    declaradas = parseEnvKeys(fs.readFileSync(dotenvPath(), 'utf-8'));
  } catch {
    // Sem `.env` legível o piso fixo já cobre o que derrubou o agendaexpert.
  }

  cache = sanitizePm2Env(process.env, declaradas);
  return cache;
}

/** Apenas para teste: descarta o `.env` já lido. */
export function resetPm2EnvCache(): void {
  cache = null;
}
