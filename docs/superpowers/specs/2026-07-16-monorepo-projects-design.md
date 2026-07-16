# Design: Monorepo Projects (one shared clone/install → N services)

**Date:** 2026-07-16
**Status:** Implemented
**Builds on:** `2026-07-16-monorepo-deploy-design.md` (package-manager detection, per-app `.env`, scoped build/start). Reuses `backend/src/deploy/package-manager.ts`.
**Area:** `backend/src/projects` (new), `backend/src/deploy/deploy.service.ts`, `backend/prisma`, frontend new "Monorepo Project" wizard + dashboard grouping.

## Problem

Today each deployable thing is one `App`, and each deploy does its own `git clone` + `install` into `APPS_DIR/<app>/releases/<ts>`. Deploying the 3 apps of a pnpm+Turbo monorepo (`@blurp/backend`, `@blurp/frontend`, `@blurp/admin`) therefore clones the repo **3×** and installs **3×** — triplicating disk for the shared `node_modules` and `packages/*`. The user wants: mark a repo as a monorepo, have the panel **auto-detect the internal apps**, configure each independently (port/domain/type/env), and deploy them all from **one shared clone + one install**.

## Goals

1. A monorepo is a first-class **Project**: one `git clone` + one root `install` per deploy, shared by all its services.
2. The panel **auto-detects** deployable apps in the workspace and lists them for the user to include/configure.
3. Each service keeps its **own** name, port, domain, app type, env, PM2 process, and nginx site.
4. **Storage:** N services of a project cost **1 clone + 1 install**, not N×.
5. No regression: existing standalone Apps (incl. the shipped single-service monorepo mode) keep working unchanged.

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| A | Dashboard / model | **Each service = its own `App` card, grouped under a `Project`.** Reuses PM2/nginx/Versions/per-app restart. |
| B | Release / rollback unit | **Project.** One shared clone per deploy; rollback re-points the project and restarts all services. Services can still be start/stop/restart individually. |
| C | Scope | **Shared-clone engine + auto-detection wizard**, one iteration. |
| D | Detection heuristic | Any workspace whose `package.json` has a framework dep (`next` / `@nestjs/core` / `vite`) **and** a `start` or `dev` script. Libs (`packages/*` without start) excluded. |

## Data model (`backend/prisma/schema.prisma`)

New `Project`:
```prisma
model Project {
  id             String   @id @default(uuid())
  name           String   @unique
  repository     String
  branch         String   @default("main")
  packageManager String?  // detected at deploy; stored for display
  envVars        String?  // shared/root-level env written to <release>/.env
  currentPath    String?  // shared release symlink target
  status         String   @default("stopped")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  apps           App[]
  deploys        Deploy[]
}
```

`App` gains:
```prisma
  projectId String?
  project   Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)
```
- `projectId != null` → the App is a **service** of a project: it does **not** clone/install on its own; it is built + started from the project's shared release. It still owns `appDir`, `workspacePackage`, `type`, `port`, `domain`, `envVars`, and the optional command overrides.
- `projectId == null` → today's standalone App, unchanged.

`Deploy` gains `projectId String?` (+ relation) so a deploy record can represent a **project-level release** (shared clone) instead of a single app.

Migration is additive (all new columns nullable / new table). Server upgrade path uses `prisma db push` as before.

## Storage layout

- Standalone App (unchanged): `APPS_DIR/<app>/releases/<ts>/` + `current`.
- **Project:** `APPS_DIR/<project>/releases/<ts>/` = **one** clone; `APPS_DIR/<project>/current` → release. Every service runs from `current/<appDir>`.
  - `blurp` → `/root/apps/blurp/releases/<ts>/` (1 clone, 1 root `node_modules` + built `packages/*`); services `blurp-backend|frontend|admin` run from that single tree.

## Auto-detection

New `ProjectsService.detect(repository, branch)` behind `POST /projects/detect`:
1. Shallow-clone to a temp dir: `git clone --depth 1 --branch <branch> <repo> <APPS_DIR>/.detect/<uuid>`.
2. Read workspace globs: `pnpm-workspace.yaml` (`packages:` list) or root `package.json` `workspaces` (array or `{ packages: [] }`). Minimal parse: extract quoted/bare patterns; expand `<dir>/*` by listing subdirs, plus explicit paths.
3. For each workspace dir with a `package.json`: read `name`, deps, `scripts`. Reuse `detectAppType(dir)`. **Deployable** iff `type != null` **and** (`scripts.start` or `scripts.dev`). Suggested port: first `-p <n>` / `--port <n>` found in `scripts.start`/`scripts.dev`, else the next free port (via existing `checkPort` logic), else blank. Suggested name: `<project>-<lastPathSegment>`.
4. Return `{ packageManager, services: [{ appDir, workspacePackage, type, suggestedPort, suggestedName, hasPrisma }] }`. `hasPrisma` = `<dir>/prisma/schema.prisma` exists.
5. Always `rm -rf` the temp clone (finally).

For blurp this yields exactly: `apps/backend (@blurp/backend, nestjs, prisma)`, `apps/frontend (@blurp/frontend, nextjs, 3000)`, `apps/admin (@blurp/admin, nextjs, 3002)`; `packages/*` excluded.

## Project CRUD + deploy API (`backend/src/projects`)

New `ProjectsModule` (`projects.controller.ts`, `projects.service.ts`), JWT-guarded:
- `POST /projects/detect { repository, branch }` → detection result (above).
- `POST /projects { name, repository, branch, envVars?, generateSSL?, services: Service[] }` where
  `Service = { name, appDir, workspacePackage?, type, port, domain?, envVars?, migrateCommand?, startCommand? }`.
  (No per-service `installCommand`/`buildCommand`: install is root-level once, build is project-wide once — see orchestration. `migrateCommand` and `startCommand` are per-service.)
  Validates unique project name, unique app names, unique ports (across all Apps). Creates the `Project` + one `App` per service (`projectId` set), then calls `DeployService.deployProject(projectId, { generateSSL })`.
- `POST /projects/:id/redeploy` → `deployProject` again.
- `POST /projects/:id/rollback/:deployId` → re-point `current`, restart all services.
- `GET /projects` → projects with nested `apps` (services). `GET /projects/:id` → one project + services + recent deploys.
- `DELETE /projects/:id` → stop+delete all member services (PM2 + nginx + `/var/www`), remove `APPS_DIR/<project>`, cascade-delete rows.

## Deploy orchestration — `DeployService.deployProject(projectId, opts)`

Reuses the existing private helpers (`runCommand`, `installDependencies`, `generatePM2Config`, `updateNginxConfig`, logging/phases). Steps:

1. Create a project-level `Deploy` record (`projectId` set). Log/stream under the project name.
2. **Clone once** → `releaseDir = APPS_DIR/<project>/releases/<ts>`.
3. `pm = detectPackageManager(releaseDir)`; `corepack enable` if `packageManager` field present (non-fatal). Persist `project.packageManager`.
4. **Env files (layered):**
   - `project.envVars` → `releaseDir/.env` (shared root env).
   - For each service: `service.envVars` → `releaseDir/<appDir>/.env`. This is what lets a **single** shared build bake each Next app's `NEXT_PUBLIC_*` correctly (Next loads `.env` from its own package dir at build).
5. **Install once at root:** `installDependencies(releaseDir, <project>, pm, undefined, …)` → `pnpm install --frozen-lockfile --prod=false` (per §package-manager, devDeps included). No per-project custom install in this iteration.
6. **Prisma per service:** for each service with `hasPrisma` (`current/<appDir>/prisma/schema.prisma`): `execCmd(pm, { pkg: service.workspacePackage, argv: ['prisma','generate'] })`, then migrate (`service.migrateCommand` or `execCmd(pm, { pkg, argv:['prisma','migrate','deploy'] })`). Run from `releaseDir`.
7. **Build once:** if `turbo.json` at root and any selected service → `turboBuildManyCmd(pm, selectedPkgs)` = `pnpm exec turbo run build --filter=<a> --filter=<b> …` (Turbo builds `packages/*` deps once, cached). No turbo → loop `runScriptCmd(pm, { pkg, script:'build' })` per service (still one install). Build process env = `process.env` + parsed `project.envVars` (per-service `NEXT_PUBLIC_*` come from each app's `.env`).
8. **Symlink** `APPS_DIR/<project>/current` → `releaseDir`.
9. **Per service** (iterate; a failure marks that service failed but continues others, then the project deploy reports partial failure):
   - Effective type = `detectAppType(current/<appDir>) || service.type`.
   - Non-vite → PM2: `generatePM2Config(serviceApp, current, mergedEnv, service.startCommand, { pm, pkg: service.workspacePackage, effectiveType })` with `mergedEnv = projectEnv + serviceEnv + { PORT: service.port, NODE_ENV: 'production' }`; `pm2 start`/`restart <service.name>`.
   - Vite → copy `current/<appDir>/dist` → `/var/www/<service.name>`.
   - `updateNginxConfig(serviceApp)` for its domain/port; optional SSL per service if `generateSSL` + domain.
   - Update the service App's `status`/`currentPath`.
10. Mark project deploy `success` (or `partial`/`failed`); set `project.status`, `project.currentPath`.

**Rollback** (`rollback(projectId, deployId)`): re-point `current` → that deploy's release, restart every non-vite service's PM2 process, re-copy vite dists; update flags. Whole-project.

## New pure helpers (`backend/src/deploy/package-manager.ts`, unit-tested)

- `turboBuildManyCmd(pm, pkgs: string[]): string` → `execCmd(pm, { argv: ['turbo','run','build', ...pkgs.map(p => \`--filter=\${p}\`)] })`.
- `parseWorkspaceGlobs(pnpmYaml?: string, pkgJson?: object): string[]` → ordered glob patterns from `pnpm-workspace.yaml` or `package.json` `workspaces`.
- `parseStartPort(scripts: { start?: string; dev?: string }): number | null` → first `-p`/`--port` number.
- (Workspace-dir expansion + `detectAppType` reuse live in `ProjectsService`, using fs.)

## Frontend

- **New wizard** — `src/pages/Project.tsx` (route `/projects/new`, nav entry "New Project"):
  - Step 1: repository + branch → **Detect apps** (`api.detectProject`).
  - Step 2: list detected services, each a row with include-checkbox + editable name/port/domain/type + per-service env; a shared "Project env" box; optional SSL.
  - Step 3: **Deploy Project** → live logs (reuse the existing deploy WebSocket stream, keyed by project name).
- **Dashboard grouping** (`src/pages/Dashboard.tsx`): fetch `GET /projects`; render each project as a section header (repo/branch + **Redeploy project** / rollback) containing its service `App` cards; standalone apps stay ungrouped. Existing `AppCard` reused.
- `src/lib/api.ts`: `detectProject`, `createProject`, `getProjects`, `redeployProject`, `rollbackProject`, `deleteProject`.
- `src/types/app.ts`: `Project`, `DetectedService`; `App` gains `projectId?`.

## Testing

- **Unit (`node --test`)** for the new pure helpers: `turboBuildManyCmd` (multi-filter string), `parseWorkspaceGlobs` (pnpm yaml + package.json array + `{packages}`), `parseStartPort` (`-p 3000`, `--port 4001`, none). Extends existing `package-manager.test.ts` style.
- **Detection unit** (`ProjectsService.detect` workspace expansion): a fixture temp dir mirroring blurp (`apps/{backend,frontend,admin}` + `packages/*`) → asserts exactly the 3 services with right type/port/pkg, libs excluded.
- **Manual acceptance:** create a blurp project via the wizard; assert a single `git clone` + single `pnpm install`, one `pnpm exec turbo run build --filter=... (×3)`, 3 PM2 processes on distinct ports with correct domains, and only **one** `releases/<ts>` tree on disk.

## Risks / edge cases

- **Partial failure:** one service failing to build/start shouldn't roll back the others; report per-service status, mark project `partial`. Documented in orchestration step 9.
- **`pnpm-workspace.yaml` parsing:** no YAML lib in the backend — use a minimal line parser for the `packages:` list; fall back to `package.json` `workspaces`; if neither, treat repo as single-package (no services detected → tell the user).
- **Port suggestions vs occupied ports:** detected `-p` ports may collide with existing apps (e.g. blurp frontend's `3000` vs `aura`). Suggest, but validate uniqueness on save and let the user change; PM2 start passes the chosen port regardless (Next `--port` override).
- **Shared build env for `NEXT_PUBLIC_*`:** relies on per-service `.env` files (step 4) being written **before** the build. If a service needs a build-time secret that isn't `NEXT_PUBLIC_*`, it must be in the project env or that service's `.env`.
- **Prisma across services:** only services with a schema run migrations; multiple prisma services each migrate their own scoped package.
- **Delete safety:** deleting a project stops/removes all its services (PM2 + nginx + `/var/www` + `APPS_DIR/<project>`); confirm in UI.
