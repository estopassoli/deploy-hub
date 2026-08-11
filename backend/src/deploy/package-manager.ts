import * as fs from 'fs';
import * as path from 'path';

export type PmName = 'npm' | 'pnpm' | 'yarn';
export type AppType = 'nextjs' | 'nestjs' | 'vitejs';

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

/** Turbo build scoped to a package (invoked via the package manager since turbo may not be global). */
export function turboBuildCmd(pm: PmInfo, pkg: string): string {
  return execCmd(pm, { argv: ['turbo', 'run', 'build', `--filter=${pkg}`] });
}

/** Detect app framework from a directory's package.json deps. Null if unknown. */
export function detectAppType(appWorkDir: string): AppType | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appWorkDir, 'package.json'), 'utf-8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps['next']) return 'nextjs';
    if (deps['@nestjs/core']) return 'nestjs';
    if (deps['vite']) return 'vitejs';
  } catch {
    // ignore
  }
  return null;
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
  return [...localBinDirs(cwd, boundary), basePath].filter(Boolean).join(path.delimiter);
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
