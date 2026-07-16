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
