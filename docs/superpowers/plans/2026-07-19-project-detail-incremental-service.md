# Project Detail + Incremental Service Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir gerenciar um projeto monorepo depois de criado — editar env, adicionar/remover/reaplicar um service individual sem derrubar os que já rodam — e recolher os cards de projeto no Dashboard.

**Architecture:** O núcleo é `DeployService.deployProjectService()`, que opera **dentro do release atual** (`~/apps/<project>/current`) em vez de criar um release novo: install na raiz, build só do pacote alvo via `turbo --filter`, e `startService()` só desse service. Os endpoints de projeto e a página `/projects/:id` são camadas finas sobre isso. Config por service reusa o `PUT /apps/:id` que já existe.

**Tech Stack:** NestJS + Prisma (SQLite), React 18 + Vite + Tailwind + shadcn/ui (Radix), socket.io, PM2, Nginx, pnpm/npm/yarn via `package-manager.ts`.

**Spec:** `docs/superpowers/specs/2026-07-19-project-detail-and-incremental-service-deploy-design.md`

## Global Constraints

- Branch de trabalho: `feat/project-detail-incremental-service` (já criada, ramificada de `feat/project-generate-ssl`). Não ramificar de `main` — o PR #6 ainda não foi mergeado e toca a mesma região do `Dashboard.tsx`.
- Backend roda Node 24 com type-stripping nativo: imports relativos de arquivos TS levam a extensão `.ts` (ex.: `from './workspace-scan.ts'`). Só sintaxe apagável — nada de `enum`, `namespace` ou parameter properties novos fora do padrão já existente.
- Testes backend: `node --test` (`npm test` em `backend/`). Sem jest.
- `backend/package-lock.json` está dessincronizado — usar `npm install`, nunca `npm ci`.
- O frontend não tem runner de teste. Verificação de frontend é `npx tsc --noEmit` + `npm run build`.
- Nada de `pm2 kill`, `pm2 delete all`, `git reset --hard` ou `git checkout .` — o `backend/prisma/deployhub.db` é versionado e está em uso.
- Textos de UI em português, comentários e nomes de código em inglês, seguindo o que já existe nos arquivos tocados.
- Um deploy incremental **nunca** grava `isCurrent: true`, porque não cria release próprio e quebraria o `rollbackProject`.

---

### Task 1: `filterAvailableServices` — apps do monorepo que ainda não são service

**Files:**
- Modify: `backend/src/projects/workspace-scan.ts`
- Test: `backend/src/projects/workspace-scan.test.ts`

**Interfaces:**
- Consumes: `DetectedService` (já exportado de `workspace-scan.ts`)
- Produces: `filterAvailableServices(detected: DetectedService[], existingAppDirs: string[]): DetectedService[]` — usado na Task 3.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `backend/src/projects/workspace-scan.test.ts`:

```ts
import { filterAvailableServices } from './workspace-scan.ts';
import type { DetectedService } from './workspace-scan.ts';

function svc(appDir: string): DetectedService {
  return {
    appDir,
    workspacePackage: `@blurp/${appDir.split('/').pop()}`,
    type: 'nestjs',
    suggestedPort: null,
    suggestedName: appDir.split('/').pop() || appDir,
    hasPrisma: false,
  };
}

test('filterAvailableServices removes appDirs already deployed', () => {
  const detected = [svc('apps/backend'), svc('apps/frontend'), svc('apps/baileys-api')];
  const result = filterAvailableServices(detected, ['apps/backend', 'apps/frontend']);
  assert.deepEqual(result.map((s) => s.appDir), ['apps/baileys-api']);
});

test('filterAvailableServices keeps everything when nothing is deployed', () => {
  const detected = [svc('apps/backend'), svc('apps/admin')];
  const result = filterAvailableServices(detected, []);
  assert.deepEqual(result.map((s) => s.appDir), ['apps/backend', 'apps/admin']);
});

test('filterAvailableServices normalizes trailing slashes and ./ prefixes', () => {
  const detected = [svc('apps/backend'), svc('apps/admin')];
  const result = filterAvailableServices(detected, ['./apps/backend/', 'apps/admin']);
  assert.deepEqual(result.map((s) => s.appDir), []);
});

test('filterAvailableServices ignores empty and null-ish appDirs in the existing list', () => {
  const detected = [svc('apps/backend')];
  const result = filterAvailableServices(detected, ['', '  ']);
  assert.deepEqual(result.map((s) => s.appDir), ['apps/backend']);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npm test`
Expected: FAIL — `SyntaxError` ou `The requested module './workspace-scan.ts' does not provide an export named 'filterAvailableServices'`.

- [ ] **Step 3: Implementar**

Adicionar ao fim de `backend/src/projects/workspace-scan.ts`:

```ts
/** Normalize an appDir for comparison: strip a leading "./" and any trailing slashes. */
function normalizeAppDir(appDir: string): string {
  return appDir.trim().replace(/^\.\/+/, '').replace(/\/+$/, '');
}

/** Drop the detected services whose appDir is already a service of the project. */
export function filterAvailableServices(
  detected: DetectedService[],
  existingAppDirs: string[],
): DetectedService[] {
  const taken = new Set(
    existingAppDirs.map(normalizeAppDir).filter((d) => d.length > 0),
  );
  return detected.filter((s) => !taken.has(normalizeAppDir(s.appDir)));
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npm test`
Expected: PASS — todos os testes, incluindo os 4 novos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/projects/workspace-scan.ts backend/src/projects/workspace-scan.test.ts
git commit -m "feat(projects): filterAvailableServices — apps do monorepo ainda não deployados"
```

---

### Task 2: `deployProjectService` — deploy incremental de um service

**Files:**
- Modify: `backend/src/deploy/deploy.service.ts` (inserir logo depois do fim de `deployProject`, antes de `private async startService`)

**Interfaces:**
- Consumes: `this.installDependencies(cwd, appName, pm, customCommand?, deployId?, envVars?)`, `this.runCommand(command, cwd, appName, deployId?, extraEnv?)`, `this.startService(projectName, svc, currentLink, pm, projectEnv, generateSSL?)`, `this.parseEnvVars(envVars?)`, `this.log(appName, message, deployId?)`, `this.setPhase(appName, phase)`, `this.persistLogs(deployId)` — todos já existem nesta classe. De `package-manager.ts`: `detectPackageManager`, `execCmd`, `turboBuildCmd`, `runScriptCmd` — todos já importados no topo do arquivo.
- Produces: `deployProjectService(projectId: string, appId: string, opts?: { generateSSL?: boolean }): Promise<{ success: true; version: string; deploy: Deploy }>` — usado nas Tasks 4.

- [ ] **Step 1: Implementar o método**

Inserir em `backend/src/deploy/deploy.service.ts`, imediatamente após o fechamento de `deployProject` (a linha `}` antes de `private async startService`):

```ts
  /**
   * Deploy a single service inside the project's CURRENT release.
   *
   * Unlike deployProject, this creates no new release and never moves the `current`
   * symlink — the other services of the project keep running untouched. Used both to
   * add a service to a live project and to re-apply a service's config (env, domain).
   */
  async deployProjectService(projectId: string, appId: string, opts: { generateSSL?: boolean } = {}) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, include: { apps: true } });
    if (!project) throw new BadRequestException('Projeto não encontrado');
    const svc = project.apps.find((a) => a.id === appId);
    if (!svc) throw new BadRequestException('Service não pertence a este projeto');

    const currentLink = path.join(APPS_DIR, project.name, 'current');
    let releaseDir: string;
    try {
      releaseDir = await fs.promises.realpath(currentLink);
    } catch {
      throw new BadRequestException('Projeto sem release atual. Rode Redeploy project primeiro.');
    }

    const svcDir = svc.appDir ? path.join(releaseDir, svc.appDir) : releaseDir;
    if (!fs.existsSync(svcDir)) {
      let commit = 'desconhecido';
      try {
        const { stdout } = await execAsync(`cd ${releaseDir} && git rev-parse --short HEAD`);
        commit = stdout.trim();
      } catch {
        /* release sem git */
      }
      throw new BadRequestException(
        `${svc.appDir} não existe no release atual (commit ${commit}). Rode Redeploy project para trazer o código novo.`,
      );
    }

    const key = project.name; // log/stream key — same as project deploys
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');

    // isCurrent stays false: an incremental deploy has no release of its own, and marking
    // it current would make rollbackProject switch the symlink to the same dir (a no-op).
    const deploy = await this.prisma.deploy.create({
      data: {
        projectId: project.id,
        version: `${timestamp}-${svc.name}`,
        path: releaseDir,
        status: 'building',
        isCurrent: false,
      },
    });

    this.log(key, `▶ [${svc.name}] Incremental deploy into ${releaseDir}`, deploy.id);
    await this.prisma.app.update({ where: { id: svc.id }, data: { status: 'deploying' } });

    try {
      const pm: PmInfo = detectPackageManager(releaseDir);
      this.log(key, `  Package manager: ${pm.name}${pm.version ? '@' + pm.version : ''}`, deploy.id);

      // Env: project (repo root) + this service (its app dir).
      const projectEnv = this.parseEnvVars(project.envVars || undefined);
      if (project.envVars) {
        await fs.promises.writeFile(path.join(releaseDir, '.env'), project.envVars);
        this.log(key, '✓ Project .env written to repo root', deploy.id);
      }
      if (svc.envVars) {
        await fs.promises.writeFile(path.join(svcDir, '.env'), svc.envVars);
        this.log(key, `✓ [${svc.name}] .env → ${svc.appDir || '.'}/`, deploy.id);
      }

      // Install at the root — picks up the new package's dependencies.
      this.setPhase(key, 'installing');
      this.log(key, '▶ Installing dependencies (root)...', deploy.id);
      await this.installDependencies(releaseDir, key, pm, undefined, deploy.id, projectEnv);
      this.log(key, '✓ Dependencies installed', deploy.id);

      // Prisma — only for this service.
      this.setPhase(key, 'migrating');
      const svcEnv = { ...projectEnv, ...this.parseEnvVars(svc.envVars || undefined) };
      const pkg = svc.workspacePackage || undefined;
      const hasPrisma = fs.existsSync(path.join(svcDir, 'prisma', 'schema.prisma'));
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

      // Build only this package. Turbo also rebuilds the workspace packages it depends on;
      // running processes are unaffected (modules already loaded, same commit).
      this.setPhase(key, 'building');
      if (svc.workspacePackage) {
        const hasTurbo = fs.existsSync(path.join(releaseDir, 'turbo.json'));
        const buildCmd = hasTurbo
          ? turboBuildCmd(pm, svc.workspacePackage)
          : runScriptCmd(pm, { pkg: svc.workspacePackage, script: 'build' });
        this.log(key, `▶ [${svc.name}] Building...`, deploy.id);
        await this.runCommand(buildCmd, releaseDir, key, deploy.id, projectEnv);
        this.log(key, '✓ Build completed', deploy.id);
      }

      // Start only this service — PM2/static + nginx + optional certbot.
      this.setPhase(key, 'starting');
      await this.startService(project.name, svc, currentLink, pm, projectEnv, opts.generateSSL);
      await this.prisma.app.update({ where: { id: svc.id }, data: { status: 'running', currentPath: releaseDir } });

      await this.persistLogs(deploy.id);
      await this.prisma.deploy.update({ where: { id: deploy.id }, data: { status: 'success' } });
      this.log(key, `🚀 [${svc.name}] deployed — other services untouched`, deploy.id);
      this.deployGateway.emitDeployComplete(key, true, { version: deploy.version, deploy });
      return { success: true as const, version: deploy.version, deploy };
    } catch (error) {
      const msg = error.message || 'Unknown error';
      this.log(key, `❌ [${svc.name}] deploy failed: ${msg}`, deploy.id);
      await this.persistLogs(deploy.id);
      await this.prisma.deploy.update({ where: { id: deploy.id }, data: { status: 'failed' } });
      await this.prisma.app.update({ where: { id: svc.id }, data: { status: 'error' } });
      this.deployGateway.emitDeployComplete(key, false, { error: msg });
      throw new BadRequestException(`Deploy do service falhou: ${msg}`);
    }
  }
```

- [ ] **Step 2: Verificar que compila**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0, sem saída.

- [ ] **Step 3: Rodar a suíte de testes**

Run: `cd backend && npm test`
Expected: PASS — nenhuma regressão.

- [ ] **Step 4: Commit**

```bash
git add backend/src/deploy/deploy.service.ts
git commit -m "feat(deploy): deployProjectService — deploy incremental dentro do release atual"
```

---

### Task 3: Endpoints de configuração do projeto (`PUT /projects/:id`, `GET /projects/:id/available-services`)

**Files:**
- Modify: `backend/src/projects/projects.service.ts`
- Modify: `backend/src/projects/projects.controller.ts`

**Interfaces:**
- Consumes: `filterAvailableServices` (Task 1), `scanWorkspaceApps` (já existe).
- Produces: `ProjectsService.update(id, dto)`, `ProjectsService.availableServices(id, source)`. Resposta do endpoint: `{ source: 'release' | 'repo', services: DetectedService[], reason?: 'no-release' }` — consumida na Task 7.

- [ ] **Step 1: Ajustar o import em `projects.service.ts`**

Trocar a linha 10 de `backend/src/projects/projects.service.ts`:

```ts
import { scanWorkspaceApps } from './workspace-scan';
```

por:

```ts
import { scanWorkspaceApps, filterAvailableServices } from './workspace-scan';
```

- [ ] **Step 2: Adicionar os métodos ao `ProjectsService`**

Inserir em `backend/src/projects/projects.service.ts`, logo depois de `findOne` (antes de `create`):

```ts
  /** Update project-level settings. Nothing is written to disk — it applies on the next deploy. */
  async update(id: string, dto: { envVars?: string; branch?: string }) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    const data: { envVars?: string | null; branch?: string } = {};
    if (dto.envVars !== undefined) data.envVars = dto.envVars || null;
    if (dto.branch) data.branch = dto.branch;
    return this.prisma.project.update({ where: { id }, data, include: { apps: true } });
  }

  /**
   * Monorepo apps that are not services of this project yet.
   *
   * `release` scans the deployed clone — instant, and guarantees the app can be built
   * incrementally. `repo` clones the branch into a tmp dir to show apps added after the
   * last deploy; those need a full "Redeploy project" before they can be added.
   */
  async availableServices(id: string, source: 'release' | 'repo' = 'release') {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { apps: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    const existing = project.apps.map((a) => a.appDir || '');

    if (source === 'release') {
      const currentLink = path.join(APPS_DIR, project.name, 'current');
      let releaseDir: string;
      try {
        releaseDir = await fs.promises.realpath(currentLink);
      } catch {
        return { source: 'release' as const, services: [], reason: 'no-release' as const };
      }
      return { source: 'release' as const, services: filterAvailableServices(scanWorkspaceApps(releaseDir), existing) };
    }

    const tmp = path.join(APPS_DIR, '.detect', crypto.randomUUID());
    try {
      await fs.promises.mkdir(path.dirname(tmp), { recursive: true });
      await execAsync(`git clone --depth 1 --branch ${project.branch} ${project.repository} ${tmp}`);
      return { source: 'repo' as const, services: filterAvailableServices(scanWorkspaceApps(tmp), existing) };
    } finally {
      await execAsync(`rm -rf ${tmp}`).catch(() => undefined);
    }
  }
```

- [ ] **Step 3: Expor no controller**

Em `backend/src/projects/projects.controller.ts`, trocar a linha 1:

```ts
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
```

por:

```ts
import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
```

Adicionar a classe de DTO logo depois de `CreateProjectDto`:

```ts
class UpdateProjectDto {
  @IsOptional() @IsString() envVars?: string;
  @IsOptional() @IsString() branch?: string;
}
```

E adicionar os handlers logo depois de `create`:

```ts
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Get(':id/available-services')
  availableServices(@Param('id') id: string, @Query('source') source?: string) {
    return this.projects.availableServices(id, source === 'repo' ? 'repo' : 'release');
  }
```

- [ ] **Step 4: Verificar que compila e que os testes seguem passando**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: exit 0 no `tsc`, todos os testes PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/projects/projects.service.ts backend/src/projects/projects.controller.ts
git commit -m "feat(projects): PUT /projects/:id e GET /projects/:id/available-services"
```

---

### Task 4: Endpoints de service (`POST`, `POST .../deploy`, `DELETE`)

**Files:**
- Modify: `backend/src/projects/projects.service.ts`
- Modify: `backend/src/projects/projects.controller.ts`

**Interfaces:**
- Consumes: `DeployService.deployProjectService(projectId, appId, opts)` (Task 2).
- Produces: `ProjectsService.addService(id, dto)`, `ProjectsService.redeployService(id, appId)`, `ProjectsService.removeService(id, appId)`. Consumidos nas Tasks 6 e 7.

> **Atenção ao nomear:** o método que dispara o deploy de um service **não** pode se chamar `deployService` — a classe já tem a propriedade `private deployService: DeployService` e TypeScript não permite membro duplicado. Usar `redeployService`.

- [ ] **Step 1: Adicionar os métodos ao `ProjectsService`**

Inserir em `backend/src/projects/projects.service.ts`, logo depois de `redeploy` (antes de `rollback`):

```ts
  /** Add one monorepo app as a service of a live project, then deploy just it. */
  async addService(id: string, dto: ServiceInput & { generateSSL?: boolean }) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { apps: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado');

    if (await this.prisma.app.findUnique({ where: { name: dto.name } })) {
      throw new ConflictException(`Nome ${dto.name} já está em uso`);
    }
    const portTaken = await this.prisma.app.findFirst({ where: { port: dto.port } });
    if (portTaken) throw new ConflictException(`Porta ${dto.port} em uso por ${portTaken.name}`);
    if (project.apps.some((a) => a.appDir === dto.appDir)) {
      throw new ConflictException(`${dto.appDir} já é um service deste projeto`);
    }

    const app = await this.prisma.app.create({
      data: {
        name: dto.name,
        type: dto.type,
        port: dto.port,
        domain: dto.domain || null,
        repository: project.repository,
        branch: project.branch,
        appDir: dto.appDir,
        workspacePackage: dto.workspacePackage || null,
        envVars: dto.envVars || null,
        migrateCommand: dto.migrateCommand || null,
        startCommand: dto.startCommand || null,
        webhookSecret: crypto.randomBytes(16).toString('hex'),
        projectId: project.id,
      },
    });

    // Fire-and-forget: logs stream over WebSocket keyed by project name.
    this.deployService
      .deployProjectService(project.id, app.id, { generateSSL: dto.generateSSL })
      .catch((e) => console.error('[deployProjectService]', e?.message));
    return app;
  }

  /** Re-apply one existing service (new env/domain) without touching the others. */
  async redeployService(id: string, appId: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { apps: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    if (!project.apps.some((a) => a.id === appId)) throw new NotFoundException('Service não encontrado neste projeto');
    this.deployService.deployProjectService(id, appId, {}).catch((e) => console.error('[deployProjectService]', e?.message));
    return { success: true };
  }

  /** Remove a single service: PM2 process, nginx vhost, static dir, PM2 config, DB row. */
  async removeService(id: string, appId: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { apps: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    const svc = project.apps.find((a) => a.id === appId);
    if (!svc) throw new NotFoundException('Service não encontrado neste projeto');
    if (project.apps.length === 1) {
      throw new BadRequestException('Este é o último service do projeto — exclua o projeto inteiro.');
    }

    await execAsync(`pm2 delete ${svc.name}`).catch(() => undefined);
    await execAsync(`sudo rm -f /etc/nginx/sites-available/${svc.name}.conf /etc/nginx/sites-enabled/${svc.name}.conf`).catch(() => undefined);
    await execAsync(`sudo rm -rf /var/www/${svc.name}`).catch(() => undefined);
    await execAsync(`rm -f ${path.join(APPS_DIR, project.name, `${svc.name}.ecosystem.config.js`)}`).catch(() => undefined);
    await execAsync('pm2 save').catch(() => undefined);
    await execAsync('sudo systemctl reload nginx').catch(() => undefined);
    // Deploy and AppMetric rows cascade on App delete (onDelete: Cascade in schema.prisma).
    await this.prisma.app.delete({ where: { id: appId } });
    return { success: true };
  }
```

- [ ] **Step 2: Expor no controller**

Em `backend/src/projects/projects.controller.ts`, adicionar a classe de DTO logo depois de `UpdateProjectDto`:

```ts
class AddServiceDto extends ServiceDto {
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') generateSSL?: boolean;
}
```

E os handlers logo depois de `availableServices`:

```ts
  @Post(':id/services')
  addService(@Param('id') id: string, @Body() dto: AddServiceDto) {
    return this.projects.addService(id, dto);
  }

  @Post(':id/services/:appId/deploy')
  redeployService(@Param('id') id: string, @Param('appId') appId: string) {
    return this.projects.redeployService(id, appId);
  }

  @Delete(':id/services/:appId')
  removeService(@Param('id') id: string, @Param('appId') appId: string) {
    return this.projects.removeService(id, appId);
  }
```

- [ ] **Step 3: Verificar que compila e que os testes seguem passando**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: exit 0 no `tsc`, todos os testes PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/projects/projects.service.ts backend/src/projects/projects.controller.ts
git commit -m "feat(projects): adicionar, reaplicar e remover service individual"
```

---

### Task 5: Cliente de API + painel de logs + shell da página `/projects/:id`

**Files:**
- Modify: `src/lib/api.ts`
- Create: `src/components/projects/DeployLogPanel.tsx`
- Create: `src/pages/ProjectDetail.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Dashboard.tsx` (nome do projeto vira link)

**Interfaces:**
- Consumes: endpoints das Tasks 3 e 4.
- Produces: `api.getProject`, `api.updateProject`, `api.getAvailableServices`, `api.addProjectService`, `api.deployProjectService`, `api.removeProjectService`; componente `<DeployLogPanel projectName={string} />`. A página `ProjectDetail` renderiza `<ServiceConfigCard>` (Task 6) e `<AddServiceForm>` (Task 7) — nesta task ela ainda não os importa.

- [ ] **Step 1: Adicionar os métodos ao cliente de API**

Em `src/lib/api.ts`, adicionar dentro da classe `ApiClient`, logo depois de `generateProjectSsl`:

```ts
  async getProject(id: string) {
    return this.request<any>(`/projects/${id}`);
  }

  async updateProject(id: string, data: { envVars?: string; branch?: string }) {
    return this.request<any>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async getAvailableServices(id: string, source: 'release' | 'repo' = 'release') {
    return this.request<{
      source: 'release' | 'repo';
      services: Array<{ appDir: string; workspacePackage: string; type: string; suggestedPort: number | null; suggestedName: string; hasPrisma: boolean }>;
      reason?: string;
    }>(`/projects/${id}/available-services?source=${source}`);
  }

  async addProjectService(id: string, data: {
    name: string;
    appDir: string;
    workspacePackage?: string;
    type: string;
    port: number;
    domain?: string;
    envVars?: string;
    generateSSL?: boolean;
  }) {
    return this.request<any>(`/projects/${id}/services`, { method: 'POST', body: JSON.stringify(data) });
  }

  async deployProjectService(id: string, appId: string) {
    return this.request<any>(`/projects/${id}/services/${appId}/deploy`, { method: 'POST' });
  }

  async removeProjectService(id: string, appId: string) {
    return this.request<any>(`/projects/${id}/services/${appId}`, { method: 'DELETE' });
  }
```

- [ ] **Step 2: Criar o painel de logs**

Criar `src/components/projects/DeployLogPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { getConnectedSocket } from '@/lib/websocket';

interface Props {
  projectName: string;
}

/** Live deploy log stream. Project and per-service deploys both publish on the project name key. */
export function DeployLogPanel({ projectName }: Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    let socket: Awaited<ReturnType<typeof getConnectedSocket>> | null = null;
    let cancelled = false;

    const onLog = (d: { appName: string; message: string }) => {
      if (d.appName === projectName) setLogs((prev) => [...prev, d.message]);
    };
    const onComplete = (d: { appName: string; success: boolean; error?: string }) => {
      if (d.appName !== projectName) return;
      setLogs((prev) => [...prev, d.success ? '🚀 Concluído' : `❌ Falhou: ${d.error || 'erro desconhecido'}`]);
    };

    getConnectedSocket().then((s) => {
      if (cancelled) return;
      socket = s;
      s.on('deploy:log', onLog);
      s.on('deploy:complete', onComplete);
      s.emit('subscribe-deploy', { appName: projectName });
    });

    return () => {
      cancelled = true;
      if (socket) {
        socket.off('deploy:log', onLog);
        socket.off('deploy:complete', onComplete);
        socket.emit('unsubscribe-deploy');
      }
    };
  }, [projectName]);

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <span className="text-xs font-mono text-muted-foreground">deploy --project {projectName}</span>
        {logs.length > 0 && (
          <button onClick={() => setLogs([])} className="text-xs text-muted-foreground hover:text-foreground">
            limpar
          </button>
        )}
      </div>
      <div className="h-[280px] overflow-auto p-4 font-mono text-sm terminal-scroll">
        {logs.length === 0 ? (
          <div className="text-muted-foreground">Aguardando um deploy...</div>
        ) : (
          logs.map((l, i) => (
            <div key={i} className="py-0.5 text-foreground/90 break-all">
              {l}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Criar a página**

Criar `src/pages/ProjectDetail.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DeployLogPanel } from '@/components/projects/DeployLogPanel';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projectEnv, setProjectEnv] = useState('');
  const [savingEnv, setSavingEnv] = useState(false);
  const [sslLoading, setSslLoading] = useState(false);

  const load = useCallback(
    async (withEnv = false) => {
      if (!id) return;
      try {
        const p = await api.getProject(id);
        setProject(p);
        if (withEnv) setProjectEnv(p.envVars || '');
      } catch (e: any) {
        toast.error(e.message || 'Erro ao carregar projeto');
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Keep service status/uptime fresh while a deploy runs.
  useEffect(() => {
    const t = setInterval(() => load(false), 5000);
    return () => clearInterval(t);
  }, [load]);

  const handleSaveEnv = async () => {
    if (!id) return;
    setSavingEnv(true);
    try {
      await api.updateProject(id, { envVars: projectEnv });
      toast.success('Env do projeto salvo — aplica no próximo deploy');
      load(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSavingEnv(false);
    }
  };

  const handleRedeployProject = async () => {
    if (!id) return;
    try {
      await api.redeployProject(id);
      toast.success('Redeploy do projeto iniciado');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao redeployar');
    }
  };

  const handleGenerateSsl = async () => {
    if (!id) return;
    setSslLoading(true);
    const t = toast.loading('Gerando SSL...');
    try {
      const res = await api.generateProjectSsl(id);
      const results = res.results || [];
      const failed = results.filter((r) => !r.ok);
      if (results.length === 0) toast.info(res.message || 'Nenhum domínio configurado', { id: t });
      else if (failed.length === 0) toast.success(`SSL gerado: ${results.length}/${results.length} domínios OK`, { id: t });
      else toast.error(`${results.length - failed.length}/${results.length} OK · falhou: ${failed.map((r) => r.domain).join(', ')}`, { id: t });
    } catch (e: any) {
      toast.error(e.message || 'Erro ao gerar SSL', { id: t });
    } finally {
      setSslLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    try {
      await api.deleteProject(id);
      toast.success('Projeto excluído');
      navigate('/');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir projeto');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <h3 className="text-lg font-medium">Projeto não encontrado</h3>
          <Button asChild variant="gradient" className="mt-4">
            <Link to="/">Voltar ao Dashboard</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const services = project.apps || [];

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{project.name}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
              {project.repository} · {project.branch} · {project.packageManager || '—'} · {services.length} services
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleRedeployProject}>
              <RefreshCw className="h-4 w-4" />
              Redeploy project
            </Button>
            <Button size="sm" variant="outline" disabled={sslLoading} onClick={handleGenerateSsl}>
              {sslLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Gerar SSL
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir projeto">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir projeto {project.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso vai parar e remover os {services.length} services do projeto (processos PM2, configs do Nginx,
                    arquivos em /var/www e em ~/apps/{project.name}) e apagar os registros. Esta ação é irreversível.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDeleteProject}
                  >
                    Excluir projeto
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-3">
          <div>
            <Label htmlFor="penv">Env do projeto</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Compartilhado por todos os services — vira o <span className="font-mono">.env</span> da raiz do monorepo.
              Aplica no próximo deploy.
            </p>
          </div>
          <textarea
            id="penv"
            value={projectEnv}
            onChange={(e) => setProjectEnv(e.target.value)}
            className="flex min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            placeholder="DATABASE_URL=...&#10;REDIS_URL=..."
          />
          <div className="flex justify-end">
            <Button size="sm" variant="gradient" disabled={savingEnv} onClick={handleSaveEnv}>
              {savingEnv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Services</h2>
          {/* Task 6 renderiza <ServiceConfigCard> aqui */}
        </div>

        {/* Task 7 renderiza <AddServiceForm> aqui */}

        <DeployLogPanel projectName={project.name} />
      </div>
    </Layout>
  );
}
```

- [ ] **Step 4: Registrar a rota**

Em `src/App.tsx`, adicionar o import junto dos outros de página:

```tsx
import ProjectDetail from "./pages/ProjectDetail";
```

E adicionar a rota logo depois da linha de `/projects/new`:

```tsx
            <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
```

- [ ] **Step 5: Linkar o nome do projeto no Dashboard**

Em `src/pages/Dashboard.tsx`, trocar:

```tsx
                      <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
```

por:

```tsx
                      <Link to={`/projects/${project.id}`} className="text-sm font-semibold text-foreground hover:text-primary">
                        {project.name}
                      </Link>
```

(`Link` já está importado de `react-router-dom` no arquivo.)

- [ ] **Step 6: Verificar tipos e build**

Run: `cd /root/deploy-hub && npx tsc --noEmit && npm run build`
Expected: exit 0 nos dois.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api.ts src/components/projects/DeployLogPanel.tsx src/pages/ProjectDetail.tsx src/App.tsx src/pages/Dashboard.tsx
git commit -m "feat(ui): página /projects/:id com env do projeto e stream de logs"
```

---

### Task 6: Card de service editável

**Files:**
- Create: `src/components/projects/ServiceConfigCard.tsx`
- Modify: `src/pages/ProjectDetail.tsx`

**Interfaces:**
- Consumes: `api.updateApp` (já existe), `api.deployProjectService`, `api.removeProjectService` (Task 5).
- Produces: `<ServiceConfigCard app={any} projectId={string} canRemove={boolean} onChanged={() => void} />`.

- [ ] **Step 1: Criar o componente**

Criar `src/components/projects/ServiceConfigCard.tsx`:

```tsx
import { useState } from 'react';
import { Loader2, Rocket, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  app: any;
  projectId: string;
  canRemove: boolean;
  onChanged: () => void;
}

export function ServiceConfigCard({ app, projectId, canRemove, onChanged }: Props) {
  const [domain, setDomain] = useState(app.domain || '');
  const [envVars, setEnvVars] = useState(app.envVars || '');
  const [startCommand, setStartCommand] = useState(app.startCommand || '');
  const [migrateCommand, setMigrateCommand] = useState(app.migrateCommand || '');
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateApp(app.id, {
        domain: domain || undefined,
        envVars,
        startCommand: startCommand || undefined,
        migrateCommand: migrateCommand || undefined,
      });
      toast.success(`${app.name} salvo — use "Deploy service" para aplicar`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      await api.deployProjectService(projectId, app.id);
      toast.success(`Deploy de ${app.name} iniciado — os outros services seguem rodando`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao deployar service');
    } finally {
      setDeploying(false);
    }
  };

  const handleRemove = async () => {
    try {
      await api.removeProjectService(projectId, app.id);
      toast.success(`${app.name} removido`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao remover service');
    }
  };

  const statusColor =
    app.status === 'running' ? 'bg-success' : app.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground';

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', statusColor)} />
          <span className="font-semibold text-foreground">{app.name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {app.workspacePackage || app.appDir} · {app.type} · :{app.port}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
          <Button size="sm" variant="gradient" disabled={deploying} onClick={handleDeploy} title="Rebuilda e reinicia só este service">
            {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Deploy service
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={!canRemove}
                title={canRemove ? 'Remover service' : 'Último service — exclua o projeto inteiro'}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover {app.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Para o processo PM2, remove o vhost do Nginx e os arquivos em /var/www/{app.name}, e apaga o registro.
                  Os outros services do projeto não são afetados. Esta ação é irreversível.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleRemove}
                >
                  Remover service
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Domínio</Label>
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} className="font-mono text-sm" placeholder="api.example.com" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Start command (opcional)</Label>
          <Input value={startCommand} onChange={(e) => setStartCommand(e.target.value)} className="font-mono text-sm" placeholder="node dist/main.js" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Migrate command (opcional)</Label>
        <Input value={migrateCommand} onChange={(e) => setMigrateCommand(e.target.value)} className="font-mono text-sm" placeholder="pnpm prisma migrate deploy" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Env do service (vira {app.appDir || '.'}/.env)</Label>
        <textarea
          value={envVars}
          onChange={(e) => setEnvVars(e.target.value)}
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
          placeholder="NEXT_PUBLIC_API_URL=..."
        />
      </div>
    </div>
  );
}
```

> A porta não é editável: `App.port` é `@unique` e trocá-la exige realocar o vhost e o processo. Para mudar de porta, remova e adicione o service de novo.

- [ ] **Step 2: Renderizar na página**

Em `src/pages/ProjectDetail.tsx`, adicionar o import:

```tsx
import { ServiceConfigCard } from '@/components/projects/ServiceConfigCard';
```

E trocar o bloco:

```tsx
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Services</h2>
          {/* Task 6 renderiza <ServiceConfigCard> aqui */}
        </div>
```

por:

```tsx
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Services</h2>
          {services.map((svc: any) => (
            <ServiceConfigCard
              key={svc.id}
              app={svc}
              projectId={project.id}
              canRemove={services.length > 1}
              onChanged={() => load(false)}
            />
          ))}
        </div>
```

- [ ] **Step 3: Verificar tipos e build**

Run: `cd /root/deploy-hub && npx tsc --noEmit && npm run build`
Expected: exit 0 nos dois.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ServiceConfigCard.tsx src/pages/ProjectDetail.tsx
git commit -m "feat(ui): editar, deployar e remover service individual"
```

---

### Task 7: Adicionar service ao projeto

**Files:**
- Create: `src/components/projects/AddServiceForm.tsx`
- Modify: `src/pages/ProjectDetail.tsx`

**Interfaces:**
- Consumes: `api.getAvailableServices`, `api.addProjectService` (Task 5).
- Produces: `<AddServiceForm projectId={string} projectName={string} onAdded={() => void} />`.

- [ ] **Step 1: Criar o componente**

Criar `src/components/projects/AddServiceForm.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Detected {
  appDir: string;
  workspacePackage: string;
  type: string;
  suggestedPort: number | null;
  suggestedName: string;
  hasPrisma: boolean;
}

interface Props {
  projectId: string;
  projectName: string;
  onAdded: () => void;
}

export function AddServiceForm({ projectId, projectName, onAdded }: Props) {
  const [available, setAvailable] = useState<Detected[]>([]);
  const [source, setSource] = useState<'release' | 'repo'>('release');
  const [reason, setReason] = useState<string | undefined>();
  const [scanning, setScanning] = useState(true);
  const [selected, setSelected] = useState<Detected | null>(null);
  const [name, setName] = useState('');
  const [port, setPort] = useState('');
  const [domain, setDomain] = useState('');
  const [envVars, setEnvVars] = useState('');
  const [generateSSL, setGenerateSSL] = useState(false);
  const [adding, setAdding] = useState(false);

  const scan = useCallback(
    async (src: 'release' | 'repo') => {
      setScanning(true);
      try {
        const res = await api.getAvailableServices(projectId, src);
        setAvailable(res.services);
        setSource(res.source);
        setReason(res.reason);
      } catch (e: any) {
        toast.error(e.message || 'Erro ao detectar apps');
      } finally {
        setScanning(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    scan('release');
  }, [scan]);

  const handleSelect = (svc: Detected) => {
    setSelected(svc);
    setName(`${projectName}-${svc.suggestedName}`);
    setPort(svc.suggestedPort ? String(svc.suggestedPort) : '');
    setDomain('');
    setEnvVars('');
  };

  const handleAdd = async () => {
    if (!selected) return;
    if (!name) return toast.error('Informe o nome do service');
    if (!port) return toast.error('Informe a porta');
    setAdding(true);
    try {
      await api.addProjectService(projectId, {
        name,
        appDir: selected.appDir,
        workspacePackage: selected.workspacePackage || undefined,
        type: selected.type,
        port: parseInt(port, 10),
        domain: domain || undefined,
        envVars: envVars || undefined,
        generateSSL,
      });
      toast.success(`${name} adicionado — deploy incremental iniciado`);
      setSelected(null);
      await scan(source);
      onAdded();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao adicionar service');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Adicionar service</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {source === 'release'
            ? 'Apps do monorepo presentes no release atual que ainda não são service. Sobem com deploy incremental — os outros services não reiniciam.'
            : 'Apps encontrados na branch. Um app que não existe no release atual exige um "Redeploy project" antes de subir.'}
        </p>
      </div>

      {scanning ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Detectando apps...
        </div>
      ) : available.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {reason === 'no-release'
            ? 'O projeto ainda não tem release em disco. Rode "Redeploy project" primeiro.'
            : 'Todos os apps do monorepo já são services deste projeto.'}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {available.map((svc) => (
            <button
              key={svc.appDir}
              onClick={() => handleSelect(svc)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                selected?.appDir === svc.appDir ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
              )}
            >
              <div className="font-mono text-sm text-foreground">{svc.workspacePackage}</div>
              <div className="text-xs text-muted-foreground">
                {svc.type} · {svc.appDir}
                {svc.hasPrisma ? ' · prisma' : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {source === 'release' && (
        <Button variant="ghost" size="sm" onClick={() => scan('repo')} disabled={scanning}>
          <Search className="h-4 w-4" />
          Não achou o app? Buscar no repositório
        </Button>
      )}

      {selected && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="font-mono text-sm text-foreground">{selected.workspacePackage}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Porta</Label>
              <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} className="font-mono text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Domínio (opcional)</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} className="font-mono text-sm" placeholder="api.example.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Env do service (vira {selected.appDir}/.env)</Label>
            <textarea
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
              placeholder="JWT_SECRET=..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="add-ssl"
              checked={generateSSL}
              onChange={(e) => setGenerateSSL(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="add-ssl" className="text-sm">
              Gerar SSL (Certbot) se tiver domínio
            </Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
              Cancelar
            </Button>
            <Button variant="gradient" size="sm" disabled={adding} onClick={handleAdd}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar e deployar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Renderizar na página**

Em `src/pages/ProjectDetail.tsx`, adicionar o import:

```tsx
import { AddServiceForm } from '@/components/projects/AddServiceForm';
```

E trocar a linha:

```tsx
        {/* Task 7 renderiza <AddServiceForm> aqui */}
```

por:

```tsx
        <AddServiceForm projectId={project.id} projectName={project.name} onAdded={() => load(false)} />
```

- [ ] **Step 3: Verificar tipos e build**

Run: `cd /root/deploy-hub && npx tsc --noEmit && npm run build`
Expected: exit 0 nos dois.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/AddServiceForm.tsx src/pages/ProjectDetail.tsx
git commit -m "feat(ui): adicionar service a um projeto existente com deploy incremental"
```

---

### Task 8: Card de projeto colapsável no Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `@/components/ui/collapsible` (Radix, já no repo).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Adicionar imports**

Em `src/pages/Dashboard.tsx`, adicionar `ChevronDown` à lista de ícones importados de `lucide-react`:

```tsx
import {
  Server,
  Rocket,
  Activity,
  AlertCircle,
  Plus,
  Loader2,
  Trash2,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
```

E adicionar, junto dos outros imports de componente:

```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
```

- [ ] **Step 2: Adicionar o estado persistido**

Em `src/pages/Dashboard.tsx`, logo depois da linha `const [sslLoading, setSslLoading] = useState<string | null>(null);`:

```tsx
  // Collapsed project cards, persisted as one map so a reload keeps the layout.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('deployhub:projects-collapsed');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const toggleCollapsed = (projectId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [projectId]: !prev[projectId] };
      try {
        localStorage.setItem('deployhub:projects-collapsed', JSON.stringify(next));
      } catch {
        /* storage cheio ou bloqueado — o toggle ainda vale na sessão */
      }
      return next;
    });
  };
```

- [ ] **Step 3: Envolver o card do projeto no Collapsible**

Em `src/pages/Dashboard.tsx`, substituir todo o bloco `{projects.map((project) => ( ... ))}` — do `<div key={project.id} className="rounded-xl border border-border bg-card/40 p-3">` até o `</div>` que o fecha — por:

```tsx
              {projects.map((project) => {
                const svcs = appsByProject(project.id);
                const running = svcs.filter((a) => a.status === 'running').length;
                const errored = svcs.filter((a) => a.status === 'error').length;
                const isOpen = !collapsed[project.id];
                return (
                  <Collapsible
                    key={project.id}
                    open={isOpen}
                    onOpenChange={() => toggleCollapsed(project.id)}
                    className="rounded-xl border border-border bg-card/40 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2 px-1">
                      <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
                        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !isOpen && '-rotate-90')} />
                        <div>
                          <Link
                            to={`/projects/${project.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm font-semibold text-foreground hover:text-primary"
                          >
                            {project.name}
                          </Link>
                          <p className="text-xs text-muted-foreground font-mono">
                            {project.branch} · {project.packageManager || '—'} · {svcs.length} services · {running} running
                            {errored > 0 ? ` · ${errored} erro` : ''}
                          </p>
                        </div>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" disabled={sslLoading === project.id} onClick={() => handleGenerateSsl(project)} title="Gerar/renovar certificado SSL de todos os domínios do projeto">
                          {sslLoading === project.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          Gerar SSL
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => api.redeployProject(project.id).then(() => toast.success('Redeploy iniciado')).catch((e) => toast.error(e.message))}>
                          Redeploy project
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir projeto">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir projeto {project.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Isso vai parar e remover os {svcs.length} services do projeto
                                (processos PM2, configs do Nginx, arquivos em /var/www e em ~/apps/{project.name}) e apagar
                                os registros. Esta ação é irreversível.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDeleteProject(project)}
                              >
                                Excluir projeto
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                        {svcs.map((app) => (
                          <AppCard key={app.id} app={app} onRefresh={loadData} lastUpdated={lastUpdated} />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
```

- [ ] **Step 4: Verificar tipos e build**

Run: `cd /root/deploy-hub && npx tsc --noEmit && npm run build`
Expected: exit 0 nos dois.

- [ ] **Step 5: Verificar o comportamento no browser**

Rodar `npm run dev`, abrir o Dashboard e conferir:
1. O card do projeto abre expandido na primeira visita.
2. Clicar no header recolhe e o chevron gira; a linha de resumo mostra `branch · pm · N services · N running`.
3. Clicar no nome do projeto navega para `/projects/:id` **sem** recolher o card.
4. Recarregar a página mantém o estado recolhido.
5. Os botões `Gerar SSL` / `Redeploy project` / excluir funcionam nos dois estados.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(ui): card de projeto colapsável no Dashboard, estado persistido"
```

---

## Aceitação final

Depois da Task 8, com tudo commitado:

1. **Backend:** `cd backend && npx tsc --noEmit && npm test` — exit 0 e todos os testes passando.
2. **Frontend:** `cd /root/deploy-hub && npx tsc --noEmit && npm run build` — exit 0 nos dois.
3. **Aceitação manual no servidor** (depois do deploy do painel, com o `deployhub.db` já em backup):
   - Abrir `/projects/<id>` do projeto `blurp`, conferir que o env do projeto aparece preenchido.
   - Anotar o uptime de `blurp-admin`, `blurp-backend` e `blurp-frontend` (`pm2 list`).
   - Adicionar `apps/baileys-api` pelo formulário, com porta livre e domínio.
   - Acompanhar os logs no painel e confirmar `🚀 [blurp-baileys-api] deployed — other services untouched`.
   - Rodar `pm2 list` de novo: o uptime dos outros três **não** pode ter zerado.
   - Conferir que `~/apps/blurp/current` continua apontando para o mesmo release de antes.
