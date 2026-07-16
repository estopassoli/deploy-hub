# Monorepo & Package-Manager-Aware Deploys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DeployHub deploy pnpm/yarn workspace + Turbo monorepos, detect the package manager per repo, install devDependencies during builds, and stop the npm-only "auto-heal" step from crashing non-npm deploys.

**Architecture:** Extract all command-string generation into one pure, unit-tested module (`backend/src/deploy/package-manager.ts`). `deploy.service.ts` resolves per-deploy context (package manager, monorepo app dir/package, effective app type) once, then uses the pure builders for install/prisma/build/start. The npm `--save-dev --force` auto-heal block is deleted outright. New optional `appDir` / `workspacePackage` fields flow from the deploy form through the DTOs into the `App` model.

**Tech Stack:** NestJS 10, Prisma 6 (SQLite), class-validator DTOs, Node 24 (native TS + built-in `node --test`), Vite + React + shadcn/ui frontend, PM2, Nginx.

## Global Constraints

- **No panel-generated `npm` command on pnpm/yarn projects.** Every install/build/start/prisma command is produced by the pure module keyed on the detected package manager.
- **Never** use `npm install --force`, and never auto-install a dependency the project did not declare. The auto-heal heuristic is removed, not ported.
- **Tests use Node's built-in runner** (`node --test`) — no jest/ts-jest/vitest added. The pure module uses only erasable TS syntax (interfaces, type annotations — no `enum`/`namespace`) so Node 24 runs the `.ts` test directly.
- **Node runtime is v24**; `npm/pnpm/yarn/corepack` are on PATH; `turbo` is NOT globally installed (invoke it via the package manager, e.g. `pnpm exec turbo`).
- **Single-app npm deploys must stay behavior-identical** (acceptance criterion 5). Monorepo-only behavior (detected-type override, filter/turbo commands, per-app `.env`) activates only when `appDir` or `workspacePackage` is set.
- **Backend install command is `npm ci`** (backend has its own `package-lock.json`); it is an npm project itself.
- **Commit after each task.** Branch is `feat/monorepo-deploy` (already created).

---

### Task 1: Pure `package-manager.ts` module + unit tests

**Files:**
- Create: `backend/src/deploy/package-manager.ts`
- Test: `backend/src/deploy/package-manager.test.ts`
- Modify: `backend/package.json` (add `"test"` script)

**Interfaces:**
- Consumes: nothing (pure; imports only `fs`, `path`).
- Produces (later tasks rely on these exact signatures):
  - `type PmName = 'npm' | 'pnpm' | 'yarn'`
  - `type AppType = 'nextjs' | 'nestjs' | 'vitejs'`
  - `interface PmInfo { name: PmName; version?: string; berry: boolean; viaCorepack: boolean }`
  - `detectPackageManager(rootDir: string): PmInfo`
  - `installCmd(pm: PmInfo, opts: { includeDev: boolean; frozen: boolean }): string`
  - `runScriptCmd(pm: PmInfo, opts: { pkg?: string; script: string }): string`
  - `execCmd(pm: PmInfo, opts: { pkg?: string; argv: string[] }): string`
  - `turboBuildCmd(pm: PmInfo, pkg: string): string`
  - `detectAppType(appWorkDir: string): AppType | null`
  - `readPackageName(dir: string): string | undefined`

- [ ] **Step 1: Write the failing test**

Create `backend/src/deploy/package-manager.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  detectPackageManager,
  installCmd,
  runScriptCmd,
  execCmd,
  turboBuildCmd,
  detectAppType,
  readPackageName,
  type PmInfo,
} from './package-manager.ts';

function tmp(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmtest-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const npm: PmInfo = { name: 'npm', berry: false, viaCorepack: false };
const pnpm: PmInfo = { name: 'pnpm', berry: false, viaCorepack: false };
const yarnClassic: PmInfo = { name: 'yarn', berry: false, viaCorepack: false };
const yarnBerry: PmInfo = { name: 'yarn', berry: true, viaCorepack: false };

// --- detectPackageManager ---
test('packageManager field wins over lockfile', () => {
  const dir = tmp({ 'package.json': JSON.stringify({ packageManager: 'pnpm@9.1.0' }), 'yarn.lock': '' });
  const pm = detectPackageManager(dir);
  assert.equal(pm.name, 'pnpm');
  assert.equal(pm.version, '9.1.0');
  assert.equal(pm.viaCorepack, true);
});

test('packageManager yarn@3 is berry', () => {
  const dir = tmp({ 'package.json': JSON.stringify({ packageManager: 'yarn@3.6.4' }) });
  const pm = detectPackageManager(dir);
  assert.equal(pm.name, 'yarn');
  assert.equal(pm.berry, true);
});

test('pnpm-lock.yaml -> pnpm', () => {
  assert.equal(detectPackageManager(tmp({ 'package.json': '{}', 'pnpm-lock.yaml': '' })).name, 'pnpm');
});

test('yarn.lock -> yarn classic; .yarnrc.yml -> berry', () => {
  const classic = tmp({ 'package.json': '{}', 'yarn.lock': '' });
  assert.equal(detectPackageManager(classic).name, 'yarn');
  assert.equal(detectPackageManager(classic).berry, false);
  const berry = tmp({ 'package.json': '{}', 'yarn.lock': '', '.yarnrc.yml': '' });
  assert.equal(detectPackageManager(berry).berry, true);
});

test('package-lock.json -> npm', () => {
  assert.equal(detectPackageManager(tmp({ 'package.json': '{}', 'package-lock.json': '' })).name, 'npm');
});

test('no lockfile -> npm default', () => {
  assert.equal(detectPackageManager(tmp({ 'package.json': '{}' })).name, 'npm');
});

// --- installCmd ---
test('installCmd pnpm frozen+dev', () => {
  assert.equal(installCmd(pnpm, { includeDev: true, frozen: true }), 'pnpm install --frozen-lockfile --prod=false');
});
test('installCmd pnpm non-frozen+dev', () => {
  assert.equal(installCmd(pnpm, { includeDev: true, frozen: false }), 'pnpm install --prod=false');
});
test('installCmd npm frozen+dev', () => {
  assert.equal(installCmd(npm, { includeDev: true, frozen: true }), 'npm ci --include=dev');
});
test('installCmd npm non-frozen+dev', () => {
  assert.equal(installCmd(npm, { includeDev: true, frozen: false }), 'npm install --include=dev');
});
test('installCmd yarn classic frozen+dev', () => {
  assert.equal(installCmd(yarnClassic, { includeDev: true, frozen: true }), 'yarn install --frozen-lockfile --production=false');
});
test('installCmd yarn berry frozen', () => {
  assert.equal(installCmd(yarnBerry, { includeDev: true, frozen: true }), 'yarn install --immutable');
});

// --- runScriptCmd ---
test('runScriptCmd pnpm monorepo', () => {
  assert.equal(runScriptCmd(pnpm, { pkg: '@blurp/backend', script: 'build' }), 'pnpm --filter @blurp/backend run build');
});
test('runScriptCmd npm monorepo', () => {
  assert.equal(runScriptCmd(npm, { pkg: '@blurp/backend', script: 'build' }), 'npm run build --workspace @blurp/backend');
});
test('runScriptCmd yarn monorepo', () => {
  assert.equal(runScriptCmd(yarnClassic, { pkg: '@blurp/backend', script: 'start' }), 'yarn workspace @blurp/backend run start');
});
test('runScriptCmd single-app', () => {
  assert.equal(runScriptCmd(pnpm, { script: 'build' }), 'pnpm run build');
  assert.equal(runScriptCmd(npm, { script: 'build' }), 'npm run build');
});

// --- execCmd ---
test('execCmd pnpm monorepo', () => {
  assert.equal(execCmd(pnpm, { pkg: '@blurp/backend', argv: ['prisma', 'migrate', 'deploy'] }), 'pnpm --filter @blurp/backend exec prisma migrate deploy');
});
test('execCmd npm monorepo', () => {
  assert.equal(execCmd(npm, { pkg: '@blurp/backend', argv: ['prisma', 'generate'] }), 'npm exec --workspace @blurp/backend -- prisma generate');
});
test('execCmd yarn monorepo', () => {
  assert.equal(execCmd(yarnClassic, { pkg: '@blurp/backend', argv: ['prisma', 'generate'] }), 'yarn workspace @blurp/backend exec prisma generate');
});
test('execCmd single-app', () => {
  assert.equal(execCmd(pnpm, { argv: ['nest', 'build'] }), 'pnpm exec nest build');
  assert.equal(execCmd(npm, { argv: ['prisma', 'generate'] }), 'npx prisma generate');
});

// --- turboBuildCmd ---
test('turboBuildCmd pnpm', () => {
  assert.equal(turboBuildCmd(pnpm, '@blurp/web'), 'pnpm exec turbo run build --filter=@blurp/web');
});
test('turboBuildCmd npm', () => {
  assert.equal(turboBuildCmd(npm, '@blurp/web'), 'npx turbo run build --filter=@blurp/web');
});

// --- detectAppType ---
test('detectAppType next/nest/vite/null', () => {
  assert.equal(detectAppType(tmp({ 'package.json': JSON.stringify({ dependencies: { next: '14' } }) })), 'nextjs');
  assert.equal(detectAppType(tmp({ 'package.json': JSON.stringify({ dependencies: { '@nestjs/core': '10' } }) })), 'nestjs');
  assert.equal(detectAppType(tmp({ 'package.json': JSON.stringify({ devDependencies: { vite: '5' } }) })), 'vitejs');
  assert.equal(detectAppType(tmp({ 'package.json': JSON.stringify({ dependencies: { express: '4' } }) })), null);
});

// --- readPackageName ---
test('readPackageName reads name or undefined', () => {
  assert.equal(readPackageName(tmp({ 'package.json': JSON.stringify({ name: '@blurp/backend' }) })), '@blurp/backend');
  assert.equal(readPackageName(tmp({ 'package.json': '{}' })), undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test src/deploy/package-manager.test.ts`
Expected: FAIL — `Cannot find module './package-manager.ts'` (module not created yet).

- [ ] **Step 3: Write the module**

Create `backend/src/deploy/package-manager.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/deploy/package-manager.test.ts`
Expected: PASS — all tests pass, `fail 0`.

- [ ] **Step 5: Add the `test` script**

In `backend/package.json`, add a `test` script to the `"scripts"` block (place it after `"start:prod"`):

```json
    "test": "node --test",
```

- [ ] **Step 6: Verify the script runs the suite**

Run: `cd backend && npm test`
Expected: PASS — the runner discovers `src/deploy/package-manager.test.ts` and reports `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/deploy/package-manager.ts backend/src/deploy/package-manager.test.ts backend/package.json
git commit -m "feat(deploy): pure package-manager-aware command builder module + tests"
```

---

### Task 2: Prisma `appDir` / `workspacePackage` fields + migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `App`)
- Create: `backend/prisma/migrations/<timestamp>_add_monorepo_fields/migration.sql` (generated)

**Interfaces:**
- Produces: `App.appDir?: string`, `App.workspacePackage?: string` on the Prisma client, consumed by Tasks 3–5.

- [ ] **Step 1: Install backend dependencies** (node_modules is absent)

Run: `cd backend && npm ci`
Expected: installs deps, exit 0. (If `npm ci` fails on lockfile sync, run `npm install`.)

- [ ] **Step 2: Add the fields to the schema**

In `backend/prisma/schema.prisma`, inside `model App`, add these two lines immediately after the `startCommand String?` line:

```prisma
  appDir           String?   // monorepo target subdir, e.g. "apps/backend"
  workspacePackage String?   // workspace package name, e.g. "@blurp/backend"
```

- [ ] **Step 3: Create and apply the migration**

Run: `cd backend && npx prisma migrate dev --name add_monorepo_fields`
Expected: creates `prisma/migrations/<ts>_add_monorepo_fields/`, applies it to `prisma/deployhub.db`, and regenerates the client. Exit 0.
(If it reports drift and wants a reset, do NOT reset; instead run `npx prisma migrate deploy` then `npx prisma generate` — additive nullable columns need no reset.)

- [ ] **Step 4: Verify the migration SQL adds the columns**

Run: `cd backend && grep -R "appDir" prisma/migrations`
Expected: shows `ALTER TABLE "App" ADD COLUMN "appDir" TEXT;` (and `workspacePackage`) in the new migration file.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): add App.appDir and App.workspacePackage for monorepo deploys"
```

---

### Task 3: Backend API surface — DTOs + persistence wiring

**Files:**
- Modify: `backend/src/deploy/deploy.controller.ts` (DeployDto)
- Modify: `backend/src/apps/apps.controller.ts` (CreateAppDto, UpdateAppDto)
- Modify: `backend/src/apps/apps.service.ts` (`create`, `update`)
- Modify: `backend/src/deploy/deploy.service.ts` (`deploy()` param type + persist block)

**Interfaces:**
- Consumes: `App.appDir` / `App.workspacePackage` (Task 2).
- Produces: `appDir` / `workspacePackage` accepted by `POST /deploy`, `POST /apps`, `PUT /apps/:id`, and persisted on the `App` row so `executeDeploy` (Task 4) can read `app.appDir` / `app.workspacePackage`.

- [ ] **Step 1: Add fields to `DeployDto`**

In `backend/src/deploy/deploy.controller.ts`, add after the `startCommand?` field (before `envVars?`):

```ts
  @IsOptional()
  @IsString()
  appDir?: string;

  @IsOptional()
  @IsString()
  workspacePackage?: string;
```

- [ ] **Step 2: Add fields to `CreateAppDto` and `UpdateAppDto`**

In `backend/src/apps/apps.controller.ts`, add to `CreateAppDto` (after `branch?: string;`):

```ts
  appDir?: string;
  workspacePackage?: string;
```

And add the same two lines to `UpdateAppDto` (after `startCommand?: string;`).

- [ ] **Step 3: Wire `apps.service.ts` `create` and `update`**

In `backend/src/apps/apps.service.ts`, change the `create` signature type to include the fields and persist them. Update the `create(data: {...})` parameter type by adding `appDir?: string; workspacePackage?: string;`, and add to the `prisma.app.create({ data: {...} })` object (after `branch: data.branch || 'main',`):

```ts
        appDir: data.appDir || null,
        workspacePackage: data.workspacePackage || null,
```

In `update`, extend the param type with `appDir?: string; workspacePackage?: string;` and add after the `startCommand` line in the `updateData` build:

```ts
    if (data.appDir !== undefined) updateData.appDir = data.appDir || null;
    if (data.workspacePackage !== undefined) updateData.workspacePackage = data.workspacePackage || null;
```

- [ ] **Step 4: Persist the fields in `deploy.service.ts` `deploy()`**

In `backend/src/deploy/deploy.service.ts`, extend the `deploy(data: {...})` inline type by adding `appDir?: string; workspacePackage?: string;`.

Then change the persist condition and data. Replace:

```ts
    if (data.envVars || data.installCommand || data.buildCommand || data.migrateCommand || data.startCommand) {
      app = await this.prisma.app.update({
        where: { id: app.id },
        data: {
          envVars: data.envVars ?? app.envVars,
          installCommand: data.installCommand ?? app.installCommand,
          buildCommand: data.buildCommand ?? app.buildCommand,
          migrateCommand: data.migrateCommand ?? app.migrateCommand,
          startCommand: data.startCommand ?? app.startCommand,
        },
      });
    }
```

with:

```ts
    if (data.envVars || data.installCommand || data.buildCommand || data.migrateCommand || data.startCommand || data.appDir || data.workspacePackage) {
      app = await this.prisma.app.update({
        where: { id: app.id },
        data: {
          envVars: data.envVars ?? app.envVars,
          installCommand: data.installCommand ?? app.installCommand,
          buildCommand: data.buildCommand ?? app.buildCommand,
          migrateCommand: data.migrateCommand ?? app.migrateCommand,
          startCommand: data.startCommand ?? app.startCommand,
          appDir: data.appDir ?? app.appDir,
          workspacePackage: data.workspacePackage ?? app.workspacePackage,
        },
      });
    }
```

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (the regenerated Prisma client from Task 2 now knows `appDir`/`workspacePackage`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/deploy/deploy.controller.ts backend/src/apps/apps.controller.ts backend/src/apps/apps.service.ts backend/src/deploy/deploy.service.ts
git commit -m "feat(api): accept and persist appDir/workspacePackage across deploy + apps DTOs"
```

---

### Task 4: Deploy pipeline (deploy-time) — resolution, install, prisma, build; remove auto-heal

**Files:**
- Modify: `backend/src/deploy/deploy.service.ts` (`executeDeploy`, `installDependencies`)

**Interfaces:**
- Consumes: `package-manager.ts` builders (Task 1); `app.appDir`/`app.workspacePackage` (Task 3).
- Produces: per-deploy locals `pm`, `appDir`, `workspacePackage`, `isMonorepo`, `appWorkDir`, `pkg`, `effectiveType` used here and in Task 5.

- [ ] **Step 1: Import the pure module**

At the top of `backend/src/deploy/deploy.service.ts`, add after the existing `./deploy.gateway` import:

```ts
import {
  detectPackageManager,
  detectAppType,
  readPackageName,
  installCmd,
  runScriptCmd,
  execCmd,
  turboBuildCmd,
} from './package-manager';
import type { PmInfo } from './package-manager';
```

- [ ] **Step 2: Add the resolution block after clone/commit info**

In `executeDeploy`, immediately after the commit-info block (the `await this.prisma.deploy.update({ ... commitHash ... })` call) and before the `// Write .env file if provided` comment, insert:

```ts
      // Resolve package manager + monorepo context (repo root = releaseDir)
      const appDir = (app.appDir || '').trim();
      const workspacePackage = (app.workspacePackage || '').trim();
      const isMonorepo = Boolean(appDir || workspacePackage);
      const appWorkDir = appDir ? path.join(releaseDir, appDir) : releaseDir;
      const pkg = workspacePackage || (appDir ? readPackageName(appWorkDir) : undefined);
      const pm: PmInfo = detectPackageManager(releaseDir);
      this.log(
        app.name,
        `  Package manager: ${pm.name}${pm.version ? '@' + pm.version : ''}` +
          (isMonorepo ? ` (monorepo — dir: ${appDir || '.'}, pkg: ${pkg ?? 'unknown'})` : ''),
        deploy.id,
      );
      const detectedType = isMonorepo ? detectAppType(appWorkDir) : null;
      const effectiveType: string = detectedType || app.type;
      if (isMonorepo && detectedType && detectedType !== app.type) {
        this.log(app.name, `  ⚠️ App type selected "${app.type}", detected "${detectedType}" from ${appDir}/package.json — using detected`, deploy.id);
      }
```

- [ ] **Step 3: Dual-write the `.env` (root + app dir)**

Replace the existing `.env` write block:

```ts
      // Write .env file if provided
      if (options.envVars) {
        this.log(app.name, '▶ Writing environment variables...', deploy.id);
        const envPath = path.join(releaseDir, '.env');
        await fs.promises.writeFile(envPath, options.envVars);
        this.log(app.name, '✓ Environment file created', deploy.id);
      }
```

with:

```ts
      // Write .env to the repo root and (in monorepo mode) the target app dir.
      // Env vars are ALSO exported into every step's process env (see runCommand) and PM2 config.
      if (options.envVars) {
        this.log(app.name, '▶ Writing environment variables...', deploy.id);
        await fs.promises.writeFile(path.join(releaseDir, '.env'), options.envVars);
        if (appWorkDir !== releaseDir) {
          await fs.promises.mkdir(appWorkDir, { recursive: true });
          await fs.promises.writeFile(path.join(appWorkDir, '.env'), options.envVars);
          this.log(app.name, `✓ Environment file written to repo root and ${appDir}/`, deploy.id);
        } else {
          this.log(app.name, '✓ Environment file created', deploy.id);
        }
      }
```

- [ ] **Step 4: Pass `pm` to install and rewrite `installDependencies`**

Change the install call in `executeDeploy`:

```ts
      await this.installDependencies(releaseDir, app.name, options.installCommand, deploy.id, envVarsObj);
```

to:

```ts
      await this.installDependencies(releaseDir, app.name, pm, options.installCommand, deploy.id, envVarsObj);
```

Replace the entire `installDependencies` method body with:

```ts
  private async installDependencies(
    cwd: string,
    appName: string,
    pm: PmInfo,
    customCommand?: string,
    deployId?: string,
    envVars?: Record<string, string>,
  ): Promise<void> {
    // Custom command wins verbatim.
    if (customCommand) {
      this.log(appName, `  Command: ${customCommand}`, deployId);
      await this.runCommand(customCommand, cwd, appName, deployId, envVars);
      return;
    }

    // Enable Corepack when the repo pins a packageManager (non-fatal).
    if (pm.viaCorepack) {
      try {
        this.log(appName, '  Enabling Corepack...', deployId);
        await this.runCommand('corepack enable', cwd, appName, deployId, envVars);
      } catch (e) {
        this.log(appName, `  ⚠️ corepack enable failed (continuing): ${e.message}`, deployId);
      }
    }

    // Install with devDependencies (build CLIs live there), frozen first.
    const frozen = installCmd(pm, { includeDev: true, frozen: true });
    try {
      this.log(appName, `  Command: ${frozen}`, deployId);
      await this.runCommand(frozen, cwd, appName, deployId, envVars);
    } catch (error) {
      const loose = installCmd(pm, { includeDev: true, frozen: false });
      this.log(appName, '', deployId);
      this.log(appName, '  🔧 Frozen install failed — retrying without frozen lockfile', deployId);
      this.log(appName, `  Command: ${loose}`, deployId);
      await this.runCommand(loose, cwd, appName, deployId, envVars);
    }
  }
```

- [ ] **Step 5: Make Prisma generate/migrate package-manager- and workspace-aware**

Replace the Prisma block:

```ts
      // Check for Prisma - run migrations if custom migrate command OR prisma detected
      const hasPrisma = fs.existsSync(path.join(releaseDir, 'prisma', 'schema.prisma'));
      if (hasPrisma || options.migrateCommand) {
        this.setPhase(app.name, 'migrating');
        if (hasPrisma) {
          this.log(app.name, '▶ Generating Prisma client...', deploy.id);
          await this.runCommand('npx prisma generate', releaseDir, app.name, deploy.id, envVarsObj);
          this.log(app.name, '✓ Prisma client generated', deploy.id);
        }

        // Run migrations - use custom command if provided
        const migrateCmd = options.migrateCommand || (hasPrisma ? 'npx prisma migrate deploy' : null);
        if (migrateCmd) {
          this.log(app.name, '▶ Running migrations...', deploy.id);
          try {
            await this.runCommand(migrateCmd, releaseDir, app.name, deploy.id, envVarsObj);
            this.log(app.name, '✓ Migrations applied', deploy.id);
          } catch (e) {
            this.log(app.name, '  ⚠ No migrations to apply or error', deploy.id);
          }
        }
      }
```

with:

```ts
      // Prisma — detect schema at the app dir (monorepo) or repo root; scope commands to the workspace package.
      const scopePkg = isMonorepo ? pkg : undefined;
      const hasPrisma =
        fs.existsSync(path.join(appWorkDir, 'prisma', 'schema.prisma')) ||
        fs.existsSync(path.join(releaseDir, 'prisma', 'schema.prisma'));
      if (hasPrisma || options.migrateCommand) {
        this.setPhase(app.name, 'migrating');
        if (hasPrisma) {
          const genCmd = execCmd(pm, { pkg: scopePkg, argv: ['prisma', 'generate'] });
          this.log(app.name, '▶ Generating Prisma client...', deploy.id);
          await this.runCommand(genCmd, releaseDir, app.name, deploy.id, envVarsObj);
          this.log(app.name, '✓ Prisma client generated', deploy.id);
        }

        const migrateCmd =
          options.migrateCommand ||
          (hasPrisma ? execCmd(pm, { pkg: scopePkg, argv: ['prisma', 'migrate', 'deploy'] }) : null);
        if (migrateCmd) {
          this.log(app.name, '▶ Running migrations...', deploy.id);
          try {
            await this.runCommand(migrateCmd, releaseDir, app.name, deploy.id, envVarsObj);
            this.log(app.name, '✓ Migrations applied', deploy.id);
          } catch (e) {
            this.log(app.name, '  ⚠ No migrations to apply or error', deploy.id);
          }
        }
      }
```

- [ ] **Step 6: Delete the auto-heal blocks**

Delete the entire two blocks that start with `// For NestJS projects, ensure required dev dependencies...` (the `if (app.type === 'nestjs')` block) and `// For Next.js projects, ensure required dev dependencies...` (the `if (app.type === 'nextjs')` block) — everything from that first comment through the closing brace of the `nextjs` block, immediately before the `// Build - use custom command...` comment. Both blocks contain `npm install --save-dev ... --force`; remove them completely.

- [ ] **Step 7: Make the build package-manager- and monorepo-aware**

Replace the build-command selection:

```ts
      // Build - use custom command if provided (and not empty), or npx nest build for NestJS, npm run build for others
      this.setPhase(app.name, 'building');
      let buildCmd = options.buildCommand?.trim();
      if (!buildCmd) {
        buildCmd = app.type === 'nestjs' ? 'npx nest build' : 'npm run build';
      }
      this.log(app.name, `▶ Building ${app.type} application...`, deploy.id);
      await this.runCommand(buildCmd, releaseDir, app.name, deploy.id, envVarsObj);
      this.log(app.name, '✓ Build completed', deploy.id);
```

with:

```ts
      // Build — custom command wins; else generate per package manager / monorepo / framework.
      this.setPhase(app.name, 'building');
      let buildCmd = options.buildCommand?.trim();
      if (!buildCmd) {
        const hasTurbo = fs.existsSync(path.join(releaseDir, 'turbo.json'));
        if (isMonorepo && pkg && hasTurbo) {
          buildCmd = turboBuildCmd(pm, pkg);
        } else if (isMonorepo && pkg) {
          buildCmd = runScriptCmd(pm, { pkg, script: 'build' });
        } else if (effectiveType === 'nestjs') {
          buildCmd = execCmd(pm, { argv: ['nest', 'build'] });
        } else {
          buildCmd = runScriptCmd(pm, { script: 'build' });
        }
      }
      this.log(app.name, `▶ Building ${effectiveType} application...`, deploy.id);
      await this.runCommand(buildCmd, releaseDir, app.name, deploy.id, envVarsObj);
      this.log(app.name, '✓ Build completed', deploy.id);
```

- [ ] **Step 8: Typecheck + unit tests still pass**

Run: `cd backend && npx tsc --noEmit && node --test src/deploy/package-manager.test.ts`
Expected: no type errors; all unit tests pass.

- [ ] **Step 9: Commit**

```bash
git add backend/src/deploy/deploy.service.ts
git commit -m "feat(deploy): package-manager-aware install/prisma/build, dual .env, remove npm auto-heal"
```

---

### Task 5: Deploy pipeline (runtime) — scoped PM2 start, effectiveType deployment mode, app-dir dist

**Files:**
- Modify: `backend/src/deploy/deploy.service.ts` (`executeDeploy` start/static branches, `generatePM2Config`)

**Interfaces:**
- Consumes: `pm`, `isMonorepo`, `pkg`, `appWorkDir`, `appDir`, `effectiveType` (Task 4).
- Produces: PM2 config + static copy that run scoped to the workspace package and the app's build output.

- [ ] **Step 1: Switch the PM2-vs-static branch to `effectiveType`**

In `executeDeploy`, replace the start branch condition and static-copy path. Replace:

```ts
      this.setPhase(app.name, 'starting');
      if (app.type !== 'vitejs') {
        this.log(app.name, '▶ Starting PM2 process...', deploy.id);
        const pm2Config = this.generatePM2Config(app, currentLink, envVarsObj, options.startCommand);
```

with:

```ts
      this.setPhase(app.name, 'starting');
      if (effectiveType !== 'vitejs') {
        this.log(app.name, '▶ Starting PM2 process...', deploy.id);
        const pm2Config = this.generatePM2Config(app, currentLink, envVarsObj, options.startCommand, {
          pm,
          pkg: isMonorepo ? pkg : undefined,
          effectiveType,
        });
```

Then, in the `else` (static) branch, replace the dist copy source:

```ts
        await execAsync(`sudo cp -r ${currentLink}/dist/* ${wwwDir}/`);
```

with:

```ts
        const distDir = appDir ? `${currentLink}/${appDir}/dist` : `${currentLink}/dist`;
        await execAsync(`sudo cp -r ${distDir}/* ${wwwDir}/`);
```

- [ ] **Step 2: Rewrite `generatePM2Config` to be package-manager- and workspace-aware**

Replace the `generatePM2Config` method signature and body. Change the signature to:

```ts
  private generatePM2Config(
    app: any,
    currentPath: string,
    envVars?: Record<string, string>,
    customStartCommand?: string,
    scope?: { pm: PmInfo; pkg?: string; effectiveType: string },
  ): string {
```

Replace the `const isSupported = ['nestjs', 'nextjs'].includes(app.type);` line with:

```ts
    const effectiveType = scope?.effectiveType || app.type;
    const isSupported = ['nestjs', 'nextjs'].includes(effectiveType);
```

Then, immediately after the existing `if (customStartCommand) { ... }` block (which stays as-is and still wins), insert a monorepo branch before the `// Para Next.js` block:

```ts
    // Monorepo: run the start scoped to the workspace package (exec runs in the package dir; PORT is injected).
    if (scope?.pkg) {
      const startArgs =
        effectiveType === 'nextjs'
          ? execCmd(scope.pm, { pkg: scope.pkg, argv: ['next', 'start', '--port', String(app.port)] })
          : runScriptCmd(scope.pm, { pkg: scope.pkg, script: 'start' });
      const [script, ...rest] = startArgs.split(' ');
      return `
module.exports = {
  apps: [{
    name: '${app.name}',
    cwd: '${currentPath}',
    script: '${script}',
    args: '${rest.join(' ')}',
    interpreter: 'none',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
${envString}
    }
  }]
};
`;
    }
```

Finally, change the two remaining single-app returns to use `effectiveType`: replace `if (app.type === 'nextjs') {` (the Next.js branch) with `if (effectiveType === 'nextjs') {`. The trailing NestJS/other `npm run start` return is replaced to be package-manager-aware — replace:

```ts
    // Para NestJS e outros, usa npm run start
    return `
module.exports = {
  apps: [{
    name: '${app.name}',
    cwd: '${currentPath}',
    script: 'npm',
    args: 'run start',
```

with:

```ts
    // Single-app NestJS/other: run the start script via the detected package manager.
    const startCmd = runScriptCmd(scope?.pm || { name: 'npm', berry: false, viaCorepack: false }, { script: 'start' });
    const [startScript, ...startRest] = startCmd.split(' ');
    return `
module.exports = {
  apps: [{
    name: '${app.name}',
    cwd: '${currentPath}',
    script: '${startScript}',
    args: '${startRest.join(' ')}',
```

- [ ] **Step 3: Typecheck + unit tests**

Run: `cd backend && npx tsc --noEmit && node --test src/deploy/package-manager.test.ts`
Expected: no type errors; all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/deploy/deploy.service.ts
git commit -m "feat(deploy): scoped PM2 start + effectiveType deployment mode + app-dir dist for monorepos"
```

---

### Task 6: Frontend — form fields, config modal, API client, types

**Files:**
- Modify: `src/pages/Deploy.tsx`
- Modify: `src/components/dashboard/AppConfigModal.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/types/app.ts`

**Interfaces:**
- Consumes: `POST /deploy` and `PUT /apps/:id` now accept `appDir` / `workspacePackage` (Task 3).
- Produces: UI to set both fields on first deploy and when editing an app's config.

- [ ] **Step 1: Extend the API client types**

In `src/lib/api.ts`, add `appDir?: string; workspacePackage?: string;` to:
- the `updateApp(id, data: {...})` param type (after `startCommand?: string;`),
- the `deploy(data: {...})` param type (after `startCommand?: string;`),
- the `getAppConfig` return object — add `appDir: app.appDir || '', workspacePackage: app.workspacePackage || '',` after the `startCommand` line.

- [ ] **Step 2: Extend frontend types**

In `src/types/app.ts`, add `appDir?: string;` and `workspacePackage?: string;` to the `App` interface (after `branch: string;`).

- [ ] **Step 3: Add the fields to the Deploy form state**

In `src/pages/Deploy.tsx`, add `appDir: '',` and `workspacePackage: '',` to BOTH the `useState` `formData` initializer (after `startCommand: '',`) and the `resetForm` object (after `startCommand: '',`).

- [ ] **Step 4: Add the "Monorepo" form section**

In `src/pages/Deploy.tsx`, immediately after the closing `</div>` of the "Custom Commands Section" (the `<div className="border-t border-border pt-4">` block, right before the `generateSSL` checkbox `<div className="flex items-center gap-3 ...">`), insert:

```tsx
              {/* Monorepo Section */}
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Monorepo (optional)
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="appDir" className="text-xs">App Directory</Label>
                    <Input
                      id="appDir"
                      placeholder="apps/backend"
                      value={formData.appDir}
                      onChange={(e) => setFormData({ ...formData, appDir: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workspacePackage" className="text-xs">Workspace package name</Label>
                    <Input
                      id="workspacePackage"
                      placeholder="@blurp/backend"
                      value={formData.workspacePackage}
                      onChange={(e) => setFormData({ ...formData, workspacePackage: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Fill these for pnpm/yarn workspaces. Install runs at the repo root; build/start are
                  scoped to the package. The .env is written to both the repo root and the app directory.
                </p>
              </div>
```

- [ ] **Step 5: Send the fields in the deploy payload**

In `src/pages/Deploy.tsx`, inside the `api.deploy({ ... })` call, add after `startCommand: formData.startCommand || undefined,`:

```tsx
        appDir: formData.appDir || undefined,
        workspacePackage: formData.workspacePackage || undefined,
```

- [ ] **Step 6: Add the fields to `AppConfigModal`**

In `src/components/dashboard/AppConfigModal.tsx`:

a) Extend `ConfigForm` (add after `startCommand: string;`):
```ts
  appDir: string;
  workspacePackage: string;
```
b) Extend `defaultForm` (add after `startCommand: '',`):
```ts
  appDir: '',
  workspacePackage: '',
```
c) Extend `modifiedFields` (add after the `startCommand` line):
```ts
      appDir: form.appDir !== originalForm.appDir,
      workspacePackage: form.workspacePackage !== originalForm.workspacePackage,
```
d) Extend `loadConfig`'s `loadedForm` (add after `startCommand: app.startCommand ?? '',`):
```ts
        appDir: app.appDir ?? '',
        workspacePackage: app.workspacePackage ?? '',
```
e) Extend `handleSave`'s `payload` (add after `startCommand: form.startCommand,`):
```ts
      appDir: form.appDir,
      workspacePackage: form.workspacePackage,
```
f) Add two inputs at the end of the "Custom Commands Section" (after the Start Command `</div>`, before the section's closing `</div>`):
```tsx
              {/* App Directory */}
              <div className="space-y-1.5">
                <Label htmlFor="cfgAppDir" className="text-sm flex items-center gap-2">
                  App Directory (monorepo)
                  {modifiedFields.appDir && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">modificado</span>
                  )}
                </Label>
                <Input
                  id="cfgAppDir"
                  placeholder="apps/backend"
                  className={getFieldClassName('appDir')}
                  value={form.appDir}
                  onChange={(e) => updateField('appDir', e.target.value)}
                />
              </div>

              {/* Workspace package */}
              <div className="space-y-1.5">
                <Label htmlFor="cfgWorkspacePackage" className="text-sm flex items-center gap-2">
                  Workspace package (monorepo)
                  {modifiedFields.workspacePackage && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">modificado</span>
                  )}
                </Label>
                <Input
                  id="cfgWorkspacePackage"
                  placeholder="@blurp/backend"
                  className={getFieldClassName('workspacePackage')}
                  value={form.workspacePackage}
                  onChange={(e) => updateField('workspacePackage', e.target.value)}
                />
              </div>
```

- [ ] **Step 7: Install frontend deps + typecheck**

Run: `cd /root/deploy-hub && npm ci && npx tsc -p tsconfig.app.json --noEmit`
Expected: no type errors. (If `npm ci` fails on lockfile sync, run `npm install`.)

- [ ] **Step 8: Commit**

```bash
git add src/pages/Deploy.tsx src/components/dashboard/AppConfigModal.tsx src/lib/api.ts src/types/app.ts
git commit -m "feat(ui): monorepo App Directory + Workspace package fields on deploy form and config modal"
```

---

### Task 7: Verification & docs

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-monorepo-deploy-design.md` (status line)

- [ ] **Step 1: Full backend gate**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: all unit tests pass; no type errors.

- [ ] **Step 2: Full frontend gate**

Run: `cd /root/deploy-hub && npx tsc -p tsconfig.app.json --noEmit`
Expected: no type errors.

- [ ] **Step 3: Manual acceptance checklist** (run on a host with pm2/nginx/git access — record results in the PR)

Verify against the five acceptance criteria:
1. Deploy a **pnpm + Turbo** monorepo (set App Directory `apps/<x>` + Workspace package). In the deploy log, confirm: `Package manager: pnpm...`, install is `pnpm install --frozen-lockfile --prod=false` at root, build is `pnpm exec turbo run build --filter=<pkg>` (or `pnpm --filter <pkg> run build`), and **no line contains `npm install` / `npm ci` / `--save-dev` / `--force`**.
2. With `NODE_ENV=production` in env vars, the build resolves `nest`/`next`/`tsc`/`prisma` (devDeps present).
3. Confirm there is **no** "Installing missing dev dependencies" step in the log.
4. In monorepo mode with a mismatched dropdown, the log shows the "detected ... using detected" line and builds/starts the correct framework.
5. Deploy a single-app **npm** project (no App Directory): log shows `npm ci --include=dev`, `npx nest build` / `npm run build`, and the app serves as before.

- [ ] **Step 4: Mark the spec implemented + commit**

In `docs/superpowers/specs/2026-07-16-monorepo-deploy-design.md`, change the `**Status:**` line to `Implemented`.

```bash
git add docs/superpowers/specs/2026-07-16-monorepo-deploy-design.md
git commit -m "docs: mark monorepo deploy spec implemented"
```

---

## Self-Review

**1. Spec coverage:**
- Item A (kill auto-heal, PM detection, never `--force`/npm on non-npm) → Task 4 Step 6 (delete), Task 1 (`detectPackageManager`), Task 4 Steps 1–5.
- Item B (devDeps in build under NODE_ENV=production) → Task 1 `installCmd` + Task 4 Step 4.
- Item C (monorepo fields, root install, scoped build/start, app-target type detection) → Tasks 2/3/6 (fields) + Task 4 Steps 2,5,7 + Task 5.
- Item D (export env — already done + kept; `.env` to both locations) → Task 4 Step 3.
- Acceptance criteria 1–5 → Task 7 Step 3 checklist maps each.
- Non-goals (Nx auto-detect, `pnpm prune`, bun) → intentionally absent.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code. ✅

**3. Type consistency:** `PmInfo`/`AppType` and the six builder signatures defined in Task 1 are used verbatim in Tasks 4/5. `generatePM2Config`'s new `scope?: { pm; pkg?; effectiveType }` param matches its call site in Task 5 Step 1. `appDir`/`workspacePackage` names identical across Prisma model, DTOs, service, API client, and forms. ✅
