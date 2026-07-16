# Monorepo Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a monorepo be a `Project` that clones + installs **once** and runs **N auto-detected services**, each with its own port/domain/type/env/PM2/nginx — so N services cost 1 clone + 1 install, not N×.

**Architecture:** New `Project` entity owns child `App` rows (services). `DeployService.deployProject()` clones once, installs at root, runs Prisma per service, builds once with `turbo run build --filter=… (×N)`, then starts each service (reusing existing PM2/nginx helpers). A new `ProjectsModule` adds workspace auto-detection (`POST /projects/detect`) + CRUD. A new frontend wizard drives detect → configure → deploy; the dashboard groups service cards under their project.

**Tech Stack:** NestJS 10, Prisma 6 (SQLite), Node 24 + `node --test`, pnpm/Turbo, Vite + React + shadcn/ui, PM2, Nginx. Reuses `backend/src/deploy/package-manager.ts`.

## Global Constraints

- **One clone + one install per project deploy.** Services never clone/install on their own; they build+run from the project's single release tree.
- **Build once:** a single `turbo run build --filter=<a> --filter=<b> …` for the selected services (fallback: per-service `run build` loop, still one install). Per-service `NEXT_PUBLIC_*` come from each service's `.env` written into its app dir before the build.
- **Reuse, don't duplicate:** `deployProject` reuses `DeployService` privates (`runCommand`, `installDependencies`, `generatePM2Config`, `updateNginxConfig`, `log/setPhase/persistLogs`). Deploy log streaming is keyed by the **project name**.
- **No regression:** standalone `App` deploys (incl. single-service monorepo mode) stay byte-for-byte unchanged.
- **Tests:** Node built-in `node --test`, erasable TS only (no `enum`/`namespace`).
- **Branch:** `feat/monorepo-projects` (already created off `origin/main`). Commit after each task; append the trailer `Claude-Session: https://claude.ai/code/session_01Myr6MVofN66xzZimZdDZPq` to each commit body.
- **Backend install:** `npm ci` may fail on the stale backend lockfile — fall back to `npm install`.

---

### Task 1: Pure helpers — `turboBuildManyCmd`, `parseWorkspaceGlobs`, `parseStartPort`

**Files:**
- Modify: `backend/src/deploy/package-manager.ts`
- Modify: `backend/src/deploy/package-manager.test.ts`

**Interfaces:**
- Produces: `turboBuildManyCmd(pm: PmInfo, pkgs: string[]): string`, `parseWorkspaceGlobs(pnpmYaml: string | null, pkgJson: any | null): string[]`, `parseStartPort(scripts: { start?: string; dev?: string }): number | null`. Consumed by Tasks 3 (scan) and 4 (deploy).

- [ ] **Step 1: Add failing tests**

Append to `backend/src/deploy/package-manager.test.ts` (add the three names to the existing import from `./package-manager.ts`):

```ts
// --- turboBuildManyCmd ---
test('turboBuildManyCmd multi-filter pnpm', () => {
  assert.equal(
    turboBuildManyCmd(pnpm, ['@blurp/backend', '@blurp/frontend']),
    'pnpm exec turbo run build --filter=@blurp/backend --filter=@blurp/frontend',
  );
});
test('turboBuildManyCmd single npm', () => {
  assert.equal(turboBuildManyCmd(npm, ['@blurp/web']), 'npx turbo run build --filter=@blurp/web');
});

// --- parseWorkspaceGlobs ---
test('parseWorkspaceGlobs from pnpm yaml', () => {
  const yaml = 'packages:\n  - "packages/*"\n  - "apps/*"\n';
  assert.deepEqual(parseWorkspaceGlobs(yaml, null), ['packages/*', 'apps/*']);
});
test('parseWorkspaceGlobs from package.json array', () => {
  assert.deepEqual(parseWorkspaceGlobs(null, { workspaces: ['apps/*', 'libs/*'] }), ['apps/*', 'libs/*']);
});
test('parseWorkspaceGlobs from package.json object', () => {
  assert.deepEqual(parseWorkspaceGlobs(null, { workspaces: { packages: ['apps/*'] } }), ['apps/*']);
});
test('parseWorkspaceGlobs empty when none', () => {
  assert.deepEqual(parseWorkspaceGlobs(null, {}), []);
});

// --- parseStartPort ---
test('parseStartPort reads -p and --port', () => {
  assert.equal(parseStartPort({ start: 'next start -p 3002' }), 3002);
  assert.equal(parseStartPort({ start: 'node dist/main.js', dev: 'next dev --port 3000' }), 3000);
  assert.equal(parseStartPort({ start: 'node dist/main.js' }), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && node --test src/deploy/package-manager.test.ts`
Expected: FAIL — `turboBuildManyCmd is not a function` (or import error).

- [ ] **Step 3: Implement the helpers**

Append to `backend/src/deploy/package-manager.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && node --test src/deploy/package-manager.test.ts`
Expected: PASS — `fail 0` (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/deploy/package-manager.ts backend/src/deploy/package-manager.test.ts
git commit -m "feat(deploy): turboBuildManyCmd + workspace glob/port parsers (pure, tested)"
```

---

### Task 2: Prisma — `Project` model, `App.projectId`, `Deploy.projectId` + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<ts>_add_projects/migration.sql` (generated)

**Interfaces:**
- Produces: `Project` model; `App.projectId`, `Deploy.projectId` (+ `Deploy.appId` nullable) on the Prisma client, consumed by Tasks 4–5.

- [ ] **Step 1: Ensure backend deps installed**

Run: `cd backend && npm ci` (fallback `npm install`). Expected: exit 0.

- [ ] **Step 2: Add the `Project` model**

In `backend/prisma/schema.prisma`, add after the `App` model:

```prisma
model Project {
  id             String   @id @default(uuid())
  name           String   @unique
  repository     String
  branch         String   @default("main")
  packageManager String?
  envVars        String?
  currentPath    String?
  status         String   @default("stopped")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  apps           App[]
  deploys        Deploy[]
}
```

- [ ] **Step 3: Link `App` and `Deploy` to `Project`**

In `model App`, add (after `workspacePackage String?`):
```prisma
  projectId       String?
  project         Project?    @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

In `model Deploy`, change `appId String` → `appId String?`, change `app App @relation(...)` → `app App? @relation(...)`, and add the project relation. The two relation lines become:
```prisma
  appId       String?
  app         App?     @relation(fields: [appId], references: [id], onDelete: Cascade)
  projectId   String?
  project     Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

- [ ] **Step 4: Create + apply the migration**

Run: `cd backend && npx prisma migrate dev --name add_projects`
Expected: creates `prisma/migrations/<ts>_add_projects/`, applies it, regenerates the client. Exit 0.
(If it warns about the `appId` NOT NULL→nullable rebuild, that's expected for SQLite and non-destructive; do not reset.)

- [ ] **Step 5: Verify**

Run: `cd backend && grep -R "Project" prisma/migrations/*add_projects*/migration.sql && npx prisma generate`
Expected: migration creates the `Project` table and adds `projectId` columns; client regenerates.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): Project model + App.projectId + Deploy.projectId"
```

---

### Task 3: Workspace scanner — `backend/src/projects/workspace-scan.ts` + tests

**Files:**
- Create: `backend/src/projects/workspace-scan.ts`
- Create: `backend/src/projects/workspace-scan.test.ts`

**Interfaces:**
- Consumes: `parseWorkspaceGlobs`, `parseStartPort`, `detectAppType`, `readPackageName` (Task 1 + existing).
- Produces: `interface DetectedService { appDir; workspacePackage; type; suggestedPort; suggestedName; hasPrisma }` and `scanWorkspaceApps(rootDir: string): DetectedService[]`. Consumed by Task 4 (ProjectsService.detect).

- [ ] **Step 1: Write failing tests**

Create `backend/src/projects/workspace-scan.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanWorkspaceApps } from './workspace-scan.ts';

function fixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsscan-'));
  const write = (p: string, o: unknown) => {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), typeof o === 'string' ? o : JSON.stringify(o));
  };
  write('package.json', { name: 'blurp', private: true, packageManager: 'pnpm@9.0.0' });
  write('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n  - "apps/*"\n');
  write('apps/backend/package.json', { name: '@blurp/backend', dependencies: { '@nestjs/core': '10' }, scripts: { start: 'node dist/main.js' } });
  fs.mkdirSync(path.join(dir, 'apps/backend/prisma'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps/backend/prisma/schema.prisma'), '');
  write('apps/frontend/package.json', { name: '@blurp/frontend', dependencies: { next: '14' }, scripts: { start: 'next start -p 3000' } });
  write('apps/admin/package.json', { name: '@blurp/admin', dependencies: { next: '14' }, scripts: { start: 'next start -p 3002' } });
  write('packages/ui/package.json', { name: '@blurp/ui', scripts: { build: 'tsc' } }); // lib: no framework/start -> excluded
  return dir;
}

test('scanWorkspaceApps finds the 3 blurp apps and excludes libs', () => {
  const services = scanWorkspaceApps(fixture()).sort((a, b) => a.appDir.localeCompare(b.appDir));
  assert.equal(services.length, 3);
  assert.deepEqual(services.map((s) => s.workspacePackage), ['@blurp/admin', '@blurp/backend', '@blurp/frontend']);
  const backend = services.find((s) => s.workspacePackage === '@blurp/backend')!;
  assert.equal(backend.type, 'nestjs');
  assert.equal(backend.hasPrisma, true);
  assert.equal(backend.appDir, 'apps/backend');
  const admin = services.find((s) => s.workspacePackage === '@blurp/admin')!;
  assert.equal(admin.type, 'nextjs');
  assert.equal(admin.suggestedPort, 3002);
  assert.ok(!services.some((s) => s.workspacePackage === '@blurp/ui'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && node --test src/projects/workspace-scan.test.ts`
Expected: FAIL — cannot find `./workspace-scan.ts`.

- [ ] **Step 3: Implement the scanner**

Create `backend/src/projects/workspace-scan.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { detectAppType, readPackageName, parseWorkspaceGlobs, parseStartPort } from '../deploy/package-manager';
import type { AppType } from '../deploy/package-manager';

export interface DetectedService {
  appDir: string; // repo-relative, e.g. "apps/backend"
  workspacePackage: string;
  type: AppType;
  suggestedPort: number | null;
  suggestedName: string; // last path segment
  hasPrisma: boolean;
}

/** Expand a workspace glob (only trailing `*` supported, plus explicit paths) into dirs under rootDir. */
function expandGlob(rootDir: string, glob: string): string[] {
  if (glob.endsWith('/*')) {
    const base = glob.slice(0, -2);
    const abs = path.join(rootDir, base);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.posix.join(base, d.name));
  }
  return fs.existsSync(path.join(rootDir, glob)) ? [glob] : [];
}

/** Scan a monorepo root and return the deployable services (framework dep + start/dev script). */
export function scanWorkspaceApps(rootDir: string): DetectedService[] {
  let pkgJson: any = null;
  try {
    pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  } catch {
    /* ignore */
  }
  let pnpmYaml: string | null = null;
  try {
    pnpmYaml = fs.readFileSync(path.join(rootDir, 'pnpm-workspace.yaml'), 'utf-8');
  } catch {
    /* ignore */
  }

  const globs = parseWorkspaceGlobs(pnpmYaml, pkgJson);
  const dirs = new Set<string>();
  for (const g of globs) for (const d of expandGlob(rootDir, g)) dirs.add(d);

  const services: DetectedService[] = [];
  for (const appDir of dirs) {
    const abs = path.join(rootDir, appDir);
    let pkg: any;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(abs, 'package.json'), 'utf-8'));
    } catch {
      continue;
    }
    const type = detectAppType(abs);
    const scripts = pkg.scripts || {};
    const isDeployable = type != null && (scripts.start || scripts.dev);
    if (!isDeployable) continue;
    services.push({
      appDir,
      workspacePackage: readPackageName(abs) || pkg.name || appDir,
      type: type as AppType,
      suggestedPort: parseStartPort(scripts),
      suggestedName: appDir.split('/').pop() || appDir,
      hasPrisma: fs.existsSync(path.join(abs, 'prisma', 'schema.prisma')),
    });
  }
  return services;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && node --test src/projects/workspace-scan.test.ts`
Expected: PASS — `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/projects/workspace-scan.ts backend/src/projects/workspace-scan.test.ts
git commit -m "feat(projects): workspace scanner detecting deployable apps + tests"
```

---

### Task 4: `DeployService.deployProject` + `rollbackProject` + `startService`

**Files:**
- Modify: `backend/src/deploy/deploy.service.ts`

**Interfaces:**
- Consumes: `turboBuildManyCmd` (Task 1); `Project`/`App`/`Deploy` prisma models (Task 2).
- Produces: `async deployProject(projectId: string, opts?: { generateSSL?: boolean })` and `async rollbackProject(projectId: string, deployId: string)`. Consumed by Task 5.

- [ ] **Step 1: Import `turboBuildManyCmd`**

In `backend/src/deploy/deploy.service.ts`, add `turboBuildManyCmd` to the existing import from `./package-manager` (the block that already imports `turboBuildCmd`).

- [ ] **Step 2: Add `deployProject`, `rollbackProject`, `startService`**

Insert these three methods into the `DeployService` class, right after `getDeployLogs` (before `installDependencies`):

```ts
  async deployProject(projectId: string, opts: { generateSSL?: boolean } = {}) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, include: { apps: true } });
    if (!project) throw new BadRequestException('Projeto não encontrado');
    const services = project.apps;
    if (services.length === 0) throw new BadRequestException('Projeto sem services');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    const releaseDir = path.join(APPS_DIR, project.name, 'releases', timestamp);
    const currentLink = path.join(APPS_DIR, project.name, 'current');
    const key = project.name; // log/stream key

    const deploy = await this.prisma.deploy.create({
      data: { projectId: project.id, version: timestamp, path: releaseDir, status: 'building' },
    });
    this.log(key, '▶ Starting project deploy...', deploy.id);
    this.log(key, `  Project: ${project.name} — ${services.length} services`, deploy.id);
    await this.prisma.project.update({ where: { id: project.id }, data: { status: 'deploying' } });

    try {
      await fs.promises.mkdir(path.join(APPS_DIR, project.name, 'releases'), { recursive: true });

      // Clone once
      this.setPhase(key, 'cloning');
      this.log(key, '▶ Cloning repository (once)...', deploy.id);
      await execAsync(`git clone --depth 1 --branch ${project.branch} ${project.repository} ${releaseDir}`);
      const { stdout: commitHash } = await execAsync(`cd ${releaseDir} && git rev-parse --short HEAD`);
      const { stdout: commitMessage } = await execAsync(`cd ${releaseDir} && git log -1 --pretty=%s`);
      await this.prisma.deploy.update({ where: { id: deploy.id }, data: { commitHash: commitHash.trim(), commitMessage: commitMessage.trim() } });
      this.log(key, `✓ Cloned @ ${commitHash.trim()}`, deploy.id);

      const pm: PmInfo = detectPackageManager(releaseDir);
      await this.prisma.project.update({ where: { id: project.id }, data: { packageManager: pm.name } });
      this.log(key, `  Package manager: ${pm.name}${pm.version ? '@' + pm.version : ''}`, deploy.id);

      // Env: project (root) + per-service (app dir) — the latter makes the single shared build bake each NEXT_PUBLIC_* right.
      const projectEnv = this.parseEnvVars(project.envVars || undefined);
      if (project.envVars) {
        await fs.promises.writeFile(path.join(releaseDir, '.env'), project.envVars);
        this.log(key, '✓ Project .env written to repo root', deploy.id);
      }
      for (const svc of services) {
        if (svc.envVars && svc.appDir) {
          const dir = path.join(releaseDir, svc.appDir);
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(path.join(dir, '.env'), svc.envVars);
          this.log(key, `✓ [${svc.name}] .env → ${svc.appDir}/`, deploy.id);
        }
      }

      // Install once at root
      this.setPhase(key, 'installing');
      this.log(key, '▶ Installing dependencies (root, once)...', deploy.id);
      await this.installDependencies(releaseDir, key, pm, undefined, deploy.id, projectEnv);
      this.log(key, '✓ Dependencies installed', deploy.id);

      // Prisma per service
      this.setPhase(key, 'migrating');
      for (const svc of services) {
        const svcDir = svc.appDir ? path.join(releaseDir, svc.appDir) : releaseDir;
        const hasPrisma = fs.existsSync(path.join(svcDir, 'prisma', 'schema.prisma'));
        if (!hasPrisma && !svc.migrateCommand) continue;
        const svcEnv = { ...projectEnv, ...this.parseEnvVars(svc.envVars || undefined) };
        const pkg = svc.workspacePackage || undefined;
        if (hasPrisma) {
          this.log(key, `▶ [${svc.name}] Prisma generate...`, deploy.id);
          await this.runCommand(execCmd(pm, { pkg, argv: ['prisma', 'generate'] }), releaseDir, key, deploy.id, svcEnv);
        }
        const migrateCmd = svc.migrateCommand || (hasPrisma ? execCmd(pm, { pkg, argv: ['prisma', 'migrate', 'deploy'] }) : null);
        if (migrateCmd) {
          this.log(key, `▶ [${svc.name}] Migrations...`, deploy.id);
          try {
            await this.runCommand(migrateCmd, releaseDir, key, deploy.id, svcEnv);
          } catch {
            this.log(key, `  ⚠ [${svc.name}] no migrations or error`, deploy.id);
          }
        }
      }

      // Build once
      this.setPhase(key, 'building');
      const pkgs = services.map((s) => s.workspacePackage).filter((p): p is string => Boolean(p));
      const hasTurbo = fs.existsSync(path.join(releaseDir, 'turbo.json'));
      if (hasTurbo && pkgs.length) {
        this.log(key, `▶ Building ${pkgs.length} services with Turbo...`, deploy.id);
        await this.runCommand(turboBuildManyCmd(pm, pkgs), releaseDir, key, deploy.id, projectEnv);
      } else {
        for (const svc of services) {
          if (!svc.workspacePackage) continue;
          this.log(key, `▶ [${svc.name}] Building...`, deploy.id);
          await this.runCommand(runScriptCmd(pm, { pkg: svc.workspacePackage, script: 'build' }), releaseDir, key, deploy.id, projectEnv);
        }
      }
      this.log(key, '✓ Build completed', deploy.id);

      // Shared symlink
      await execAsync(`rm -f ${currentLink} && ln -s ${releaseDir} ${currentLink}`);
      this.log(key, `✓ ${currentLink} → ${releaseDir}`, deploy.id);

      // Start each service (partial failure allowed)
      this.setPhase(key, 'starting');
      const failures: string[] = [];
      for (const svc of services) {
        try {
          await this.startService(project.name, svc, currentLink, pm, projectEnv, opts.generateSSL);
          await this.prisma.app.update({ where: { id: svc.id }, data: { status: 'running', currentPath: releaseDir } });
        } catch (e) {
          failures.push(svc.name);
          this.log(key, `❌ [${svc.name}] start failed: ${e.message}`, deploy.id);
          await this.prisma.app.update({ where: { id: svc.id }, data: { status: 'error' } });
        }
      }

      const ok = failures.length === 0;
      const projFailed = failures.length === services.length;
      await this.prisma.deploy.updateMany({ where: { projectId: project.id }, data: { isCurrent: false } });
      await this.persistLogs(deploy.id);
      await this.prisma.deploy.update({ where: { id: deploy.id }, data: { status: projFailed ? 'failed' : 'success', isCurrent: !projFailed } });
      await this.prisma.project.update({ where: { id: project.id }, data: { status: projFailed ? 'error' : 'running', currentPath: releaseDir } });
      this.log(key, ok ? '🚀 Project deploy completed!' : (projFailed ? '❌ Project deploy failed' : `⚠️ Partial deploy — failed: ${failures.join(', ')}`), deploy.id);
      this.deployGateway.emitDeployComplete(key, !projFailed, { version: timestamp, deploy, failures });
      return { success: !projFailed, partial: !ok && !projFailed, failures, version: timestamp, deploy };
    } catch (error) {
      const msg = error.message || 'Unknown error';
      this.log(key, `❌ Project deploy failed: ${msg}`, deploy.id);
      await this.persistLogs(deploy.id);
      await this.prisma.deploy.update({ where: { id: deploy.id }, data: { status: 'failed' } });
      await this.prisma.project.update({ where: { id: project.id }, data: { status: 'error' } });
      this.deployGateway.emitDeployComplete(key, false, { error: msg });
      throw new BadRequestException(`Deploy do projeto falhou: ${msg}`);
    }
  }

  private async startService(
    projectName: string,
    svc: any,
    currentLink: string,
    pm: PmInfo,
    projectEnv: Record<string, string>,
    generateSSL?: boolean,
  ) {
    const svcWorkDir = svc.appDir ? path.join(currentLink, svc.appDir) : currentLink;
    const effectiveType = detectAppType(svcWorkDir) || svc.type;
    const svcEnv = { ...projectEnv, ...this.parseEnvVars(svc.envVars || undefined) };

    if (effectiveType !== 'vitejs') {
      const cfg = this.generatePM2Config(svc, currentLink, svcEnv, svc.startCommand || undefined, {
        pm,
        pkg: svc.workspacePackage || undefined,
        effectiveType,
      });
      const cfgPath = path.join(APPS_DIR, projectName, `${svc.name}.ecosystem.config.js`);
      await fs.promises.writeFile(cfgPath, cfg);
      try {
        await execAsync(`pm2 delete ${svc.name}`);
      } catch {
        /* not running */
      }
      await execAsync(`pm2 start ${cfgPath}`);
      await execAsync('pm2 save');
      this.log(projectName, `✓ [${svc.name}] PM2 on port ${svc.port}`);
    } else {
      const wwwDir = `/var/www/${svc.name}`;
      await execAsync(`sudo mkdir -p ${wwwDir}`);
      await execAsync(`sudo rm -rf ${wwwDir}/*`);
      const distDir = svc.appDir ? `${currentLink}/${svc.appDir}/dist` : `${currentLink}/dist`;
      await execAsync(`sudo cp -r ${distDir}/* ${wwwDir}/`);
      await execAsync(`sudo chown -R www-data:www-data ${wwwDir}`);
      await execAsync(`sudo chmod -R 755 ${wwwDir}`);
      this.log(projectName, `✓ [${svc.name}] static → ${wwwDir}`);
    }

    await this.updateNginxConfig(svc);
    if (generateSSL && svc.domain) {
      try {
        await execAsync('which certbot');
        await this.runCommand(`sudo certbot --nginx -d ${svc.domain} --non-interactive --agree-tos --email admin@${svc.domain}`, '/tmp', projectName);
      } catch (e) {
        this.log(projectName, `  ⚠️ [${svc.name}] SSL skipped: ${e.message}`);
      }
    }
  }

  async rollbackProject(projectId: string, deployId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, include: { apps: true } });
    if (!project) throw new BadRequestException('Projeto não encontrado');
    const deploy = await this.prisma.deploy.findUnique({ where: { id: deployId } });
    if (!deploy || deploy.projectId !== projectId) throw new BadRequestException('Deploy não encontrado');

    const currentLink = path.join(APPS_DIR, project.name, 'current');
    await execAsync(`rm -f ${currentLink} && ln -s ${deploy.path} ${currentLink}`);
    for (const svc of project.apps) {
      if (svc.type === 'vitejs') {
        const wwwDir = `/var/www/${svc.name}`;
        const distDir = svc.appDir ? `${deploy.path}/${svc.appDir}/dist` : `${deploy.path}/dist`;
        await execAsync(`sudo rm -rf ${wwwDir}/* && sudo cp -r ${distDir}/* ${wwwDir}/`).catch(() => undefined);
      } else {
        await execAsync(`pm2 restart ${svc.name}`).catch(() => undefined);
      }
    }
    await this.prisma.deploy.updateMany({ where: { projectId }, data: { isCurrent: false } });
    await this.prisma.deploy.update({ where: { id: deployId }, data: { isCurrent: true } });
    await this.prisma.project.update({ where: { id: projectId }, data: { currentPath: deploy.path } });
    return { success: true, version: deploy.version };
  }
```

- [ ] **Step 3: Typecheck + unit tests**

Run: `cd backend && npx tsc --noEmit && node --test src/deploy/package-manager.test.ts src/projects/workspace-scan.test.ts`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/deploy/deploy.service.ts
git commit -m "feat(deploy): deployProject/rollbackProject — one clone+install, N scoped services"
```

---

### Task 5: `ProjectsModule` — detect + CRUD API

**Files:**
- Create: `backend/src/projects/projects.service.ts`
- Create: `backend/src/projects/projects.controller.ts`
- Create: `backend/src/projects/projects.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `DeployService.deployProject`/`rollbackProject` (Task 4), `scanWorkspaceApps` (Task 3), `detectPackageManager`.
- Produces REST endpoints: `POST /projects/detect`, `GET /projects`, `GET /projects/:id`, `POST /projects`, `POST /projects/:id/redeploy`, `POST /projects/:id/rollback/:deployId`, `DELETE /projects/:id`. Consumed by Task 6.

- [ ] **Step 1: Create `projects.service.ts`**

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { DeployService } from '../deploy/deploy.service';
import { detectPackageManager } from '../deploy/package-manager';
import { scanWorkspaceApps } from './workspace-scan';

const execAsync = promisify(exec);
const APPS_DIR = process.env.APPS_DIR || '/root/apps';

interface ServiceInput {
  name: string;
  appDir: string;
  workspacePackage?: string;
  type: string;
  port: number;
  domain?: string;
  envVars?: string;
  migrateCommand?: string;
  startCommand?: string;
}

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService, private deployService: DeployService) {}

  async detect(repository: string, branch = 'main') {
    if (!repository) throw new BadRequestException('repository é obrigatório');
    const tmp = path.join(APPS_DIR, '.detect', crypto.randomUUID());
    try {
      await fs.promises.mkdir(path.dirname(tmp), { recursive: true });
      await execAsync(`git clone --depth 1 --branch ${branch} ${repository} ${tmp}`);
      const pm = detectPackageManager(tmp);
      const services = scanWorkspaceApps(tmp);
      return { packageManager: pm.name, services };
    } finally {
      await execAsync(`rm -rf ${tmp}`).catch(() => undefined);
    }
  }

  async findAll() {
    return this.prisma.project.findMany({ include: { apps: true }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { apps: true, deploys: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    return project;
  }

  async create(dto: { name: string; repository: string; branch?: string; envVars?: string; generateSSL?: boolean; services: ServiceInput[] }) {
    if (!dto.services?.length) throw new BadRequestException('Informe ao menos um service');
    if (await this.prisma.project.findUnique({ where: { name: dto.name } })) {
      throw new ConflictException(`Projeto ${dto.name} já existe`);
    }
    const names = new Set<string>();
    for (const s of dto.services) {
      if (names.has(s.name)) throw new ConflictException(`Service duplicado: ${s.name}`);
      names.add(s.name);
      const existsName = await this.prisma.app.findUnique({ where: { name: s.name } });
      if (existsName) throw new ConflictException(`Nome ${s.name} já está em uso`);
      const existsPort = await this.prisma.app.findFirst({ where: { port: s.port } });
      if (existsPort) throw new ConflictException(`Porta ${s.port} em uso por ${existsPort.name}`);
    }

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        repository: dto.repository,
        branch: dto.branch || 'main',
        envVars: dto.envVars || null,
        apps: {
          create: dto.services.map((s) => ({
            name: s.name,
            type: s.type,
            port: s.port,
            domain: s.domain || null,
            repository: dto.repository,
            branch: dto.branch || 'main',
            appDir: s.appDir,
            workspacePackage: s.workspacePackage || null,
            envVars: s.envVars || null,
            migrateCommand: s.migrateCommand || null,
            startCommand: s.startCommand || null,
            webhookSecret: crypto.randomBytes(16).toString('hex'),
          })),
        },
      },
      include: { apps: true },
    });

    await fs.promises.mkdir(path.join(APPS_DIR, project.name, 'releases'), { recursive: true });
    // Fire-and-forget: logs stream over WebSocket keyed by project name.
    this.deployService.deployProject(project.id, { generateSSL: dto.generateSSL }).catch((e) => console.error('[deployProject]', e?.message));
    return project;
  }

  async redeploy(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    this.deployService.deployProject(id, {}).catch((e) => console.error('[deployProject]', e?.message));
    return { success: true };
  }

  async rollback(id: string, deployId: string) {
    return this.deployService.rollbackProject(id, deployId);
  }

  async remove(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { apps: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    for (const svc of project.apps) {
      await execAsync(`pm2 delete ${svc.name}`).catch(() => undefined);
      await execAsync(`sudo rm -f /etc/nginx/sites-available/${svc.name}.conf /etc/nginx/sites-enabled/${svc.name}.conf`).catch(() => undefined);
      await execAsync(`sudo rm -rf /var/www/${svc.name}`).catch(() => undefined);
    }
    await execAsync('pm2 save').catch(() => undefined);
    await execAsync('sudo systemctl reload nginx').catch(() => undefined);
    await execAsync(`rm -rf ${path.join(APPS_DIR, project.name)}`).catch(() => undefined);
    await this.prisma.project.delete({ where: { id } });
    return { success: true };
  }
}
```

- [ ] **Step 2: Create `projects.controller.ts`**

```ts
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectsService } from './projects.service';

class DetectDto {
  @IsString() repository: string;
  @IsOptional() @IsString() branch?: string;
}

class ServiceDto {
  @IsString() name: string;
  @IsString() appDir: string;
  @IsOptional() @IsString() workspacePackage?: string;
  @IsString() @IsIn(['nestjs', 'nextjs', 'vitejs']) type: string;
  @IsNumber() @Transform(({ value }) => parseInt(value, 10)) port: number;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() envVars?: string;
  @IsOptional() @IsString() migrateCommand?: string;
  @IsOptional() @IsString() startCommand?: string;
}

class CreateProjectDto {
  @IsString() name: string;
  @IsString() repository: string;
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() envVars?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') generateSSL?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ServiceDto) services: ServiceDto[];
}

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Post('detect')
  detect(@Body() dto: DetectDto) {
    return this.projects.detect(dto.repository, dto.branch);
  }

  @Get()
  findAll() {
    return this.projects.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projects.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Post(':id/redeploy')
  redeploy(@Param('id') id: string) {
    return this.projects.redeploy(id);
  }

  @Post(':id/rollback/:deployId')
  rollback(@Param('id') id: string, @Param('deployId') deployId: string) {
    return this.projects.rollback(id, deployId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }
}
```

- [ ] **Step 3: Create `projects.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { DeployModule } from '../deploy/deploy.module';

@Module({
  imports: [DeployModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
```

- [ ] **Step 4: Register in `app.module.ts`**

Add `import { ProjectsModule } from './projects/projects.module';` and add `ProjectsModule,` to the `imports` array (after `DeployModule,`).

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/projects/projects.service.ts backend/src/projects/projects.controller.ts backend/src/projects/projects.module.ts backend/src/app.module.ts
git commit -m "feat(projects): detect + CRUD API (ProjectsModule)"
```

---

### Task 6: Frontend API client + types

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/types/app.ts`

**Interfaces:**
- Consumes: the `/projects*` endpoints (Task 5).
- Produces: `api.detectProject`, `api.createProject`, `api.getProjects`, `api.redeployProject`, `api.rollbackProject`, `api.deleteProject`; `Project`/`DetectedService` types; `App.projectId`.

- [ ] **Step 1: Add API methods**

In `src/lib/api.ts`, add these methods to the `ApiClient` class (before the closing `}` of the class, after `getAppMetrics`):

```ts
  // Projects (monorepo)
  async detectProject(data: { repository: string; branch?: string }) {
    return this.request<{ packageManager: string; services: Array<{ appDir: string; workspacePackage: string; type: string; suggestedPort: number | null; suggestedName: string; hasPrisma: boolean }> }>('/projects/detect', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createProject(data: {
    name: string;
    repository: string;
    branch?: string;
    envVars?: string;
    generateSSL?: boolean;
    services: Array<{ name: string; appDir: string; workspacePackage?: string; type: string; port: number; domain?: string; envVars?: string }>;
  }) {
    return this.request<any>('/projects', { method: 'POST', body: JSON.stringify(data) });
  }

  async getProjects() {
    return this.request<any[]>('/projects');
  }

  async redeployProject(id: string) {
    return this.request<any>(`/projects/${id}/redeploy`, { method: 'POST' });
  }

  async rollbackProject(id: string, deployId: string) {
    return this.request<any>(`/projects/${id}/rollback/${deployId}`, { method: 'POST' });
  }

  async deleteProject(id: string) {
    return this.request<any>(`/projects/${id}`, { method: 'DELETE' });
  }
```

- [ ] **Step 2: Add types**

In `src/types/app.ts`, add `projectId?: string;` to the `App` interface, and append:

```ts
export interface DetectedService {
  appDir: string;
  workspacePackage: string;
  type: AppType;
  suggestedPort: number | null;
  suggestedName: string;
  hasPrisma: boolean;
}

export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  packageManager?: string;
  status: AppStatus;
  apps: App[];
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /root/deploy-hub && npm ci && npx tsc -p tsconfig.app.json --noEmit` (fallback `npm install`).
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts src/types/app.ts
git commit -m "feat(ui): project API client + types"
```

---

### Task 7: Frontend wizard page + route + nav

**Files:**
- Create: `src/pages/Project.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `api.detectProject`/`createProject`, the deploy WebSocket (`getConnectedSocket`, `getSocket`), keyed by project name.

- [ ] **Step 1: Create `src/pages/Project.tsx`**

```tsx
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { getConnectedSocket, getSocket } from '@/lib/websocket';
import { Loader2, Rocket, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

type Step = 'config' | 'configure' | 'deploying' | 'complete' | 'error';

interface ServiceRow {
  include: boolean;
  name: string;
  appDir: string;
  workspacePackage: string;
  type: string;
  port: string;
  domain: string;
  envVars: string;
}

export default function Project() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('config');
  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [projectName, setProjectName] = useState('');
  const [projectEnv, setProjectEnv] = useState('');
  const [generateSSL, setGenerateSSL] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [pm, setPm] = useState('');
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const logsEnd = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);
  useEffect(() => () => { getSocket().emit('unsubscribe-deploy'); }, []);

  const addLog = (m: string) => setLogs((p) => [...p, m]);

  const handleDetect = async () => {
    if (!repository) return toast.error('Informe o repositório');
    setDetecting(true);
    try {
      const res = await api.detectProject({ repository, branch });
      setPm(res.packageManager);
      if (!res.services.length) {
        toast.error('Nenhum app deployável detectado no monorepo');
        return;
      }
      const base = projectName || repository.split('/').pop()?.replace(/\.git$/, '') || 'project';
      if (!projectName) setProjectName(base);
      setServices(
        res.services.map((s) => ({
          include: true,
          name: `${base}-${s.suggestedName}`,
          appDir: s.appDir,
          workspacePackage: s.workspacePackage,
          type: s.type,
          port: s.suggestedPort ? String(s.suggestedPort) : '',
          domain: '',
          envVars: '',
        })),
      );
      setStep('configure');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao detectar');
    } finally {
      setDetecting(false);
    }
  };

  const updateSvc = (i: number, patch: Partial<ServiceRow>) =>
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const handleDeploy = async () => {
    const included = services.filter((s) => s.include);
    if (!projectName) return toast.error('Nome do projeto obrigatório');
    if (!included.length) return toast.error('Selecione ao menos um app');
    if (included.some((s) => !s.port)) return toast.error('Defina a porta de cada app selecionado');

    done.current = false;
    const socket = await getConnectedSocket();
    const onLog = (d: { appName: string; message: string }) => {
      if (d.appName === projectName) addLog(d.message);
    };
    const onComplete = (d: { appName: string; success: boolean; error?: string }) => {
      if (d.appName !== projectName || done.current) return;
      done.current = true;
      socket.off('deploy:log', onLog);
      socket.off('deploy:complete', onComplete);
      socket.emit('unsubscribe-deploy');
      if (d.success) {
        setStep('complete');
        toast.success('Projeto deployado!');
      } else {
        setErrorMsg(d.error || 'Deploy falhou');
        setStep('error');
        toast.error(d.error || 'Deploy falhou');
      }
    };
    socket.on('deploy:log', onLog);
    socket.on('deploy:complete', onComplete);
    socket.emit('subscribe-deploy', { appName: projectName });
    await new Promise((r) => setTimeout(r, 100));

    setStep('deploying');
    setLogs([]);
    addLog(`▶ Deploying project ${projectName} (${included.length} services)...`);
    try {
      await api.createProject({
        name: projectName,
        repository,
        branch,
        envVars: projectEnv || undefined,
        generateSSL,
        services: included.map((s) => ({
          name: s.name,
          appDir: s.appDir,
          workspacePackage: s.workspacePackage || undefined,
          type: s.type,
          port: parseInt(s.port, 10),
          domain: s.domain || undefined,
          envVars: s.envVars || undefined,
        })),
      });
    } catch (e: any) {
      if (!done.current) {
        done.current = true;
        setErrorMsg(e.message || 'Deploy falhou');
        setStep('error');
        toast.error(e.message || 'Deploy falhou');
      }
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">New Monorepo Project</h1>
          <p className="mt-1 text-muted-foreground">One clone + install, many services</p>
        </div>

        {step === 'config' && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repo">SSH Repository URL</Label>
              <Input id="repo" placeholder="git@github.com:user/monorepo.git" value={repository} onChange={(e) => setRepository(e.target.value)} className="font-mono" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input id="branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pname">Project Name</Label>
                <Input id="pname" placeholder="blurp" value={projectName} onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="font-mono" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => navigate('/')}>Cancel</Button>
              <Button variant="gradient" onClick={handleDetect} disabled={detecting || !repository}>
                {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Detect apps
              </Button>
            </div>
          </div>
        )}

        {step === 'configure' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Package manager: <span className="text-foreground font-mono">{pm}</span> · {services.length} apps detected
            </div>
            <div className="space-y-2">
              <Label htmlFor="penv">Project env (shared, written to repo root .env)</Label>
              <textarea id="penv" value={projectEnv} onChange={(e) => setProjectEnv(e.target.value)} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" placeholder="DATABASE_URL=...&#10;REDIS_URL=..." />
            </div>
            {services.map((s, i) => (
              <div key={s.appDir} className={cn('rounded-xl border p-4 space-y-3', s.include ? 'border-border bg-card' : 'border-dashed border-border opacity-60')}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={s.include} onChange={(e) => updateSvc(i, { include: e.target.checked })} className="h-4 w-4" />
                  <span className="font-mono text-sm">{s.workspacePackage}</span>
                  <span className="text-xs text-muted-foreground">({s.type} · {s.appDir})</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={s.name} onChange={(e) => updateSvc(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className="font-mono text-sm" /></div>
                  <div className="space-y-1"><Label className="text-xs">Port</Label><Input type="number" value={s.port} onChange={(e) => updateSvc(i, { port: e.target.value })} className="font-mono text-sm" /></div>
                  <div className="space-y-1"><Label className="text-xs">Domain (optional)</Label><Input value={s.domain} onChange={(e) => updateSvc(i, { domain: e.target.value })} className="font-mono text-sm" placeholder="api.example.com" /></div>
                  <div className="space-y-1"><Label className="text-xs">Type</Label><Input value={s.type} onChange={(e) => updateSvc(i, { type: e.target.value })} className="font-mono text-sm" /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">Service env (written to {s.appDir}/.env)</Label><textarea value={s.envVars} onChange={(e) => updateSvc(i, { envVars: e.target.value })} className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono" placeholder="NEXT_PUBLIC_API_URL=..." /></div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ssl" checked={generateSSL} onChange={(e) => setGenerateSSL(e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="ssl" className="text-sm">Generate SSL (Certbot) for services with a domain</Label>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setStep('config')}>Back</Button>
              <Button variant="gradient" onClick={handleDeploy}><Rocket className="h-4 w-4" />Deploy Project</Button>
            </div>
          </div>
        )}

        {(step === 'deploying' || step === 'error' || step === 'complete') && (
          <div className="space-y-4">
            {step === 'complete' && (
              <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center">
                <h2 className="text-xl font-bold">Project deployed!</h2>
                <p className="text-muted-foreground mt-1">{projectName}</p>
              </div>
            )}
            {step === 'error' && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">Deploy failed: {errorMsg}</div>
            )}
            <div className="rounded-xl border border-border bg-background overflow-hidden">
              <div className="border-b border-border bg-card px-4 py-2 text-xs font-mono text-muted-foreground">deploy --project {projectName}</div>
              <div className="h-[400px] overflow-auto p-4 font-mono text-sm terminal-scroll">
                {logs.map((l, i) => (<div key={i} className="py-0.5 text-foreground/90 break-all">{l}</div>))}
                <div ref={logsEnd} />
              </div>
            </div>
            {(step === 'complete' || step === 'error') && (
              <div className="flex justify-end gap-3">
                <Button variant="gradient" onClick={() => navigate('/')}>Go to Dashboard</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add `import Project from "./pages/Project";` (next to the other page imports) and add this route after the `/deploy` route:

```tsx
            <Route path="/projects/new" element={<ProtectedRoute><Project /></ProtectedRoute>} />
```

- [ ] **Step 3: Add the nav item**

In `src/components/layout/Sidebar.tsx`, add `Boxes` to the `lucide-react` import, and add this entry to the `navigation` array right after the `Deploy` entry:

```tsx
  { name: 'Monorepo', href: '/projects/new', icon: Boxes },
```

- [ ] **Step 4: Typecheck**

Run: `cd /root/deploy-hub && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Project.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(ui): monorepo project wizard (detect -> configure -> deploy)"
```

---

### Task 8: Dashboard — group service cards under their project

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `api.getProjects` (Task 6), existing `api.getApps` / `AppCard`.

- [ ] **Step 1: Fetch projects and group**

In `src/pages/Dashboard.tsx`:

a) Add `const [projects, setProjects] = useState<any[]>([]);` next to the other `useState`s.

b) In `loadData`, add `api.getProjects()` to the `Promise.allSettled` array and handle it:

Change the destructuring line to:
```ts
      const [appsResult, statsResult, logsResult, projectsResult] = await Promise.allSettled([
        api.getApps(),
        api.getStats(),
        api.getSystemLogs({ limit: 10 }),
        api.getProjects(),
      ]);
```
and after the `logsResult` handling add:
```ts
      if (projectsResult.status === 'fulfilled') setProjects(projectsResult.value || []);
```

c) Replace the applications grid block (the `{apps.length === 0 ? (...) : (<div className="grid ...">{apps.map(...)}</div>)}`) with a grouped render. Add this helper just before the `return`:
```ts
  const projectIds = new Set(projects.map((p) => p.id));
  const standaloneApps = apps.filter((a) => !a.projectId || !projectIds.has(a.projectId));
  const appsByProject = (pid: string) => apps.filter((a) => a.projectId === pid);
```
and replace the grid block with:
```tsx
          {apps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 md:p-12 text-center">
              <Server className="mx-auto h-10 w-10 md:h-12 md:w-12 text-muted-foreground" />
              <h3 className="mt-4 text-base md:text-lg font-medium">Nenhuma aplicação</h3>
              <p className="mt-2 text-sm text-muted-foreground">Comece fazendo seu primeiro deploy</p>
              <Button asChild variant="gradient" className="mt-4"><Link to="/deploy">Novo Deploy</Link></Button>
            </div>
          ) : (
            <div className="space-y-6">
              {projects.map((project) => (
                <div key={project.id} className="rounded-xl border border-border bg-card/40 p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{project.branch} · {project.packageManager || '—'}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => api.redeployProject(project.id).then(() => toast.success('Redeploy iniciado')).catch((e) => toast.error(e.message))}>
                      Redeploy project
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                    {appsByProject(project.id).map((app) => (
                      <AppCard key={app.id} app={app} onRefresh={loadData} lastUpdated={lastUpdated} />
                    ))}
                  </div>
                </div>
              ))}
              {standaloneApps.length > 0 && (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                  {standaloneApps.map((app) => (
                    <AppCard key={app.id} app={app} onRefresh={loadData} lastUpdated={lastUpdated} />
                  ))}
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 2: Typecheck**

Run: `cd /root/deploy-hub && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(ui): group service cards under their project on the dashboard"
```

---

### Task 9: Verification & docs

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-monorepo-projects-design.md` (status)

- [ ] **Step 1: Full backend gate**

Run: `cd backend && node --test src/deploy/package-manager.test.ts src/projects/workspace-scan.test.ts && npx tsc --noEmit`
Expected: all tests pass; no type errors.

- [ ] **Step 2: Full frontend gate**

Run: `cd /root/deploy-hub && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual acceptance** (host with git/pm2/nginx — record in PR)

Create a project from `git@github.com:estopassoli/blurp.git` via the wizard. Assert: detection lists `apps/backend|frontend|admin` (libs excluded); the deploy log shows **one** `git clone`, **one** `pnpm install`, **one** `pnpm exec turbo run build --filter=… (×3)`; three PM2 processes on distinct ports; only **one** `APPS_DIR/blurp/releases/<ts>` tree on disk (`du -sh` vs 3 standalone deploys); dashboard shows the three cards grouped under `blurp`.

- [ ] **Step 4: Mark spec implemented + commit**

In `docs/superpowers/specs/2026-07-16-monorepo-projects-design.md`, change `**Status:**` to `Implemented`.

```bash
git add docs/superpowers/specs/2026-07-16-monorepo-projects-design.md
git commit -m "docs: mark monorepo projects spec implemented"
```

---

## Self-Review

**1. Spec coverage:** data model → T2; auto-detection → T1(parsers)+T3(scan)+T5(`/detect`); shared clone/install/prisma/turbo-build → T4; per-service start/nginx/SSL + partial failure → T4 (`startService`); rollback whole-project → T4; project CRUD API → T5; layered env (root + per-service `.env`) → T4 step 2; wizard → T7; dashboard grouping → T8; delete-safety → T5 `remove`. Acceptance mapping → T9 step 3.

**2. Placeholder scan:** every code step has complete code; no TBD/"handle errors" placeholders.

**3. Type consistency:** `DetectedService` (T3) fields match `scanWorkspaceApps` return, the `/detect` response type in `api.detectProject` (T6), and the wizard's mapping (T7). `deployProject`/`rollbackProject` signatures (T4) match `ProjectsService` calls (T5). `turboBuildManyCmd(pm, string[])` (T1) matches its use in T4. `Deploy.appId` made nullable (T2) so project deploys (T4) can omit it.
