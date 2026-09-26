import * as fs from 'fs';
import * as path from 'path';
import { detectPreset } from './app-presets.ts';

export type PmName = 'npm' | 'pnpm' | 'yarn';
/**
 * Id de preset de aplicação. Era uma união fechada de três literais; virou `string`
 * porque a lista agora vive em `app-presets.ts` e cresce sem tocar aqui.
 */
export type AppType = string;

export interface PmInfo {
  name: PmName;
  version?: string;
  berry: boolean; // yarn >= 2 (Berry)
  viaCorepack: boolean; // package.json "packageManager" field present
}

/** Detect the package manager for a repo root. */
export function detectPackageManager(rootDir: string): PmInfo {
  // 1. package.json "packageManager" field is authoritative (Corepack standard).
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    const field: unknown = pkg.packageManager;
    if (typeof field === 'string' && field.includes('@')) {
      const [name, version] = field.split('@');
      if (name === 'pnpm' || name === 'yarn' || name === 'npm') {
        const major = parseInt(version, 10);
        const berry = name === 'yarn' && Number.isFinite(major) && major >= 2;
        return { name, version, berry, viaCorepack: true };
      }
    }
  } catch {
    // ignore — fall through to lockfile detection
  }

  // 2. lockfile at root
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
    return { name: 'pnpm', berry: false, viaCorepack: false };
  }
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    return { name: 'yarn', berry: fs.existsSync(path.join(rootDir, '.yarnrc.yml')), viaCorepack: false };
  }
  if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) {
    return { name: 'npm', berry: false, viaCorepack: false };
  }

  // 3. default
  return { name: 'npm', berry: false, viaCorepack: false };
}

/** Install command. Always run at the repo root. */
export function installCmd(pm: PmInfo, opts: { includeDev: boolean; frozen: boolean }): string {
  const { includeDev, frozen } = opts;
  switch (pm.name) {
    case 'pnpm': {
      const parts = ['pnpm', 'install'];
      if (frozen) parts.push('--frozen-lockfile');
      if (includeDev) parts.push('--prod=false');
      return parts.join(' ');
    }
    case 'yarn': {
      if (pm.berry) {
        // Berry installs devDeps by default; --immutable is the frozen equivalent.
        return frozen ? 'yarn install --immutable' : 'yarn install';
      }
      const parts = ['yarn', 'install'];
      if (frozen) parts.push('--frozen-lockfile');
      if (includeDev) parts.push('--production=false');
      return parts.join(' ');
    }
    case 'npm':
    default:
      if (frozen) return includeDev ? 'npm ci --include=dev' : 'npm ci';
      return includeDev ? 'npm install --include=dev' : 'npm install';
  }
}

/** Run a package.json script, optionally scoped to a workspace package. */
export function runScriptCmd(pm: PmInfo, opts: { pkg?: string; script: string }): string {
  const { pkg, script } = opts;
  if (pkg) {
    switch (pm.name) {
      case 'pnpm': return `pnpm --filter ${pkg} run ${script}`;
      case 'yarn': return `yarn workspace ${pkg} run ${script}`;
      case 'npm':
      default: return `npm run ${script} --workspace ${pkg}`;
    }
  }
  switch (pm.name) {
    case 'pnpm': return `pnpm run ${script}`;
    case 'yarn': return `yarn run ${script}`;
    case 'npm':
    default: return `npm run ${script}`;
  }
}

/** Execute a binary, optionally scoped to a workspace package (scoped exec runs with cwd = the package dir). */
export function execCmd(pm: PmInfo, opts: { pkg?: string; argv: string[] }): string {
  const args = opts.argv.join(' ');
  if (opts.pkg) {
    switch (pm.name) {
      case 'pnpm': return `pnpm --filter ${opts.pkg} exec ${args}`;
      case 'yarn': return `yarn workspace ${opts.pkg} exec ${args}`;
      case 'npm':
      default: return `npm exec --workspace ${opts.pkg} -- ${args}`;
    }
  }
  switch (pm.name) {
    case 'pnpm': return `pnpm exec ${args}`;
    case 'yarn': return `yarn exec ${args}`;
    case 'npm':
    default: return `npx ${args}`;
  }
}

/**
 * Build workspace packages together with the workspace packages they depend on,
 * for monorepos without Turbo.
 *
 * `pnpm --filter <pkg> run build` builds only the app itself: internal libs that
 * resolve through `main: ./dist/...` stay unbuilt and the app fails with
 * "Cannot find module '@scope/lib'". The trailing `...` selects the package plus
 * its dependencies; pnpm runs them in topological order and skips packages
 * without a `build` script. Yarn Berry gets the same via `workspaces foreach -R`.
 * npm and Yarn classic have no equivalent and keep the single-package build.
 */
export function workspaceBuildCmd(pm: PmInfo, pkgs: string[]): string {
  if (pm.name === 'pnpm') {
    return `pnpm ${pkgs.map((p) => `--filter ${p}...`).join(' ')} run build`;
  }
  if (pm.name === 'yarn' && pm.berry) {
    return `yarn workspaces foreach -Rt ${pkgs.map((p) => `--from ${p}`).join(' ')} run build`;
  }
  return pkgs.map((p) => runScriptCmd(pm, { pkg: p, script: 'build' })).join(' && ');
}

/** Turbo build scoped to a package (invoked via the package manager since turbo may not be global). */
export function turboBuildCmd(pm: PmInfo, pkg: string): string {
  return execCmd(pm, { argv: ['turbo', 'run', 'build', `--filter=${pkg}`] });
}

/**
 * JS prelude for a generated PM2 config that resolves a package's executable from
 * the RELEASE's own node_modules — never from PATH.
 *
 * Why this exists: deploy servers accumulate globally installed CLIs that squat the
 * same names. This one has next@16, tsc@2 (the registry squatter, not the compiler),
 * typescript@7, tailwind@4, vite@8, eslint and turbo installed globally. Starting an
 * app through `pnpm exec next start` hands the choice to PATH, and a Next 16 CLI
 * launched against a Next 15 build starts, prints "✓ Ready", then dies with
 * "Cannot read properties of undefined (reading 'map')" — restarting forever behind
 * a 502 while the deploy itself reported success.
 *
 * `require.resolve` never consults PATH. It finds the package this release
 * installed, and no server-level configuration can redirect it.
 *
 * The executable path comes from the package's own `bin` field rather than a
 * hardcoded `dist/bin/next`: that path is an internal detail that moves between
 * versions, and pinning it would be the next thing to break on its own.
 *
 * Resolution failure throws at `pm2 start`, which is the point — a missing package
 * surfaces as a loud deploy error instead of silently running the wrong binary.
 */
export function binResolverPrelude(o: { varName: string; pkg: string; bin: string; resolveFrom: string }): string {
  return `const { createRequire } = require('module');
const path = require('path');

function resolveBin(pkg, bin, from) {
  const manifestPath = createRequire(path.join(from, 'noop.js')).resolve(pkg + '/package.json');
  const field = require(manifestPath).bin;
  const rel = typeof field === 'string' ? field : field && field[bin];
  if (!rel) throw new Error('O pacote "' + pkg + '" em ' + from + ' não expõe o executável "' + bin + '".');
  return path.resolve(path.dirname(manifestPath), rel);
}

const ${o.varName} = resolveBin(${JSON.stringify(o.pkg)}, ${JSON.stringify(o.bin)}, ${JSON.stringify(o.resolveFrom)});`;
}

/** Detect app framework from a directory's package.json deps. Null if unknown. */
/**
 * Detecta o tipo do app a partir do package.json.
 *
 * A lógica vive no registro de presets (`app-presets.ts`), que cobre bem mais que os
 * três tipos originais e sabe distinguir, por exemplo, Astro estático de Astro SSR.
 * Esta função continua existindo com a mesma assinatura porque é o que o pipeline e o
 * scanner de monorepo já chamam.
 */
export function detectAppType(appWorkDir: string): string | null {
  return detectPreset(appWorkDir)?.id ?? null;
}

/** Read the "name" field of a package.json in the given dir (used to derive the workspace package). */
export function readPackageName(dir: string): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    return typeof pkg.name === 'string' ? pkg.name : undefined;
  } catch {
    return undefined;
  }
}

/** Turbo build scoped to several packages in one invocation (shared dep builds + cache). */
export function turboBuildManyCmd(pm: PmInfo, pkgs: string[]): string {
  return execCmd(pm, { argv: ['turbo', 'run', 'build', ...pkgs.map((p) => `--filter=${p}`)] });
}

/** Extract workspace glob patterns from pnpm-workspace.yaml text or a package.json object. */
export function parseWorkspaceGlobs(pnpmYaml: string | null, pkgJson: any | null): string[] {
  const globs: string[] = [];
  if (pnpmYaml) {
    // Minimal parse: lines like `  - "apps/*"` / `  - 'apps/*'` / `  - apps/*`
    for (const raw of pnpmYaml.split('\n')) {
      const m = raw.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
      if (m && m[1] && !m[1].startsWith('!')) globs.push(m[1].trim());
    }
  }
  if (globs.length === 0 && pkgJson && pkgJson.workspaces) {
    const ws = pkgJson.workspaces;
    const arr = Array.isArray(ws) ? ws : Array.isArray(ws.packages) ? ws.packages : [];
    for (const p of arr) if (typeof p === 'string' && !p.startsWith('!')) globs.push(p);
  }
  return globs;
}

/** First -p <n> / --port <n> found in a start/dev script, else null. */
export function parseStartPort(scripts: { start?: string; dev?: string }): number | null {
  for (const s of [scripts.start, scripts.dev]) {
    if (!s) continue;
    const m = s.match(/(?:-p|--port)[= ]+(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/**
 * Existing `node_modules/.bin` dirs from `cwd` upwards, innermost first,
 * stopping at `boundary` when given.
 *
 * In a workspace the binary lives in the repo root's node_modules, not the
 * app's, so looking only at the cwd is not enough.
 */
export function localBinDirs(cwd: string, boundary?: string): string[] {
  const limit = boundary ? path.resolve(boundary) : null;
  const dirs: string[] = [];
  let dir = path.resolve(cwd);

  while (true) {
    const bin = path.join(dir, 'node_modules', '.bin');
    if (fs.existsSync(bin)) dirs.push(bin);

    if (limit && dir === limit) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return dirs;
}

/**
 * `basePath` with the release's local bins in front.
 *
 * Deploy steps run through a shell and inherit the server's PATH, and a deploy
 * box usually has next, tsc, vite and eslint installed globally. Without this,
 * a bare `next build` picks the global binary — and a newer global Next run
 * against the version the project installed fails looking for an internal file
 * that only exists in its own release.
 */
export function hardenedPath(cwd: string, basePath: string, boundary?: string): string {
  return [...localBinDirs(cwd, boundary), deployNodeBin(), basePath].filter(Boolean).join(path.delimiter);
}

/**
 * Diretório `bin` do Node com que os deploys devem rodar.
 *
 * ## Por que isto existe
 *
 * O backend do painel roda sob o Node do sistema e **tudo que ele dispara herda
 * esse Node** — o PATH do processo só tem caminhos de sistema. Quando a máquina
 * tem um Node mais novo instalado à parte (nvm, asdf, volta e meia é o caso), o
 * build continua usando o antigo. Aí um projeto que exige Node moderno falha com
 * um erro que não se parece nada com "versão de Node errada":
 *
 *     pnpm@11 (engines: node >=22.13) sob Node 20:
 *       ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING, lançado lá dentro do corepack
 *
 *     vinext@1 sob Node 20:
 *       SyntaxError: 'node:fs/promises' does not provide an export named 'glob'
 *       (fs.promises.glob só existe a partir do Node 22)
 *
 * Nos dois casos o operador perde tempo caçando bug de ferramenta quando o
 * problema é a versão do runtime.
 *
 * ## Como configurar
 *
 * `DEPLOY_NODE_BIN` no `.env` do painel aponta o diretório `bin` a usar, por
 * exemplo `/root/.nvm/versions/node/v24.11.1/bin`. Ele entra **depois** dos
 * `node_modules/.bin` da release (o binário do projeto continua ganhando) e
 * **antes** do PATH do sistema, então `node`, `corepack`, `npm` e `pnpm` passam
 * a resolver para essa versão — tanto no build quanto no `env.PATH` do ecosystem
 * gerado, de modo que o app roda no mesmo Node em que foi construído.
 *
 * Vazio, ou apontando para um diretório sem `node` dentro, mantém o
 * comportamento antigo: herdar o Node do backend. Assim uma instalação que não
 * configurou nada não muda de comportamento no update.
 */
export function deployNodeBin(): string {
  const dir = (process.env.DEPLOY_NODE_BIN || '').trim();
  if (!dir) return '';
  // Um caminho errado no .env não pode virar um PATH quebrado: sem `node` ali
  // dentro, o diretório simplesmente não entra.
  return fs.existsSync(path.join(dir, 'node')) ? dir : '';
}

/**
 * Path to a package binary, relative to the process cwd.
 *
 * Kept relative so it still goes through the `current` symlink, which is what
 * lets a redeploy swap releases without rewriting the PM2 config.
 */
export function resolveBin(name: string, appCwd: string, boundary: string): string {
  const fallback = path.join('node_modules', '.bin', name);
  const limit = path.resolve(boundary);
  const from = path.resolve(appCwd);
  let dir = from;

  while (true) {
    const candidate = path.join(dir, 'node_modules', '.bin', name);
    if (fs.existsSync(candidate)) return path.relative(from, candidate) || fallback;

    if (dir === limit) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return fallback;
}
