import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { assertInside, assertSafeName } from '../common/paths';
import { run, runQuiet, sudoQuiet } from '../common/run';
import { PrismaService } from '../prisma/prisma.service';
import { DeployService } from '../deploy/deploy.service';
import { detectPackageManager } from '../deploy/package-manager';
import { scanWorkspaceApps, filterAvailableServices } from './workspace-scan';
import { removeApp, removeImages } from '../deploy/docker';
import { selectDeletable, type DeletableRelease } from '../apps/release-deletion';

const APPS_DIR = process.env.APPS_DIR || '/root/apps';
const WWW_DIR = '/var/www';
const NGINX_AVAILABLE = '/etc/nginx/sites-available';
const NGINX_ENABLED = '/etc/nginx/sites-enabled';

/** Argumentos de `git clone --depth 1 --branch <branch> <repo> <dir>`, sem shell. */
function gitCloneArgs(branch: string, repository: string, target: string): string[] {
  return ['clone', '--depth', '1', '--branch', branch, '--', repository, target];
}

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
      await run('git', gitCloneArgs(branch, repository, tmp));
      const pm = detectPackageManager(tmp);
      const services = scanWorkspaceApps(tmp);
      return { packageManager: pm.name, services };
    } finally {
      // tmp é montado aqui mesmo a partir de APPS_DIR + uuid, mas o assertInside é
      // barato e garante que uma mudança futura em APPS_DIR não abra um rm -rf solto.
      await runQuiet('rm', ['-rf', assertInside(tmp, [APPS_DIR], 'diretório temporário')]);
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
      await run('git', gitCloneArgs(project.branch, project.repository, tmp));
      return { source: 'repo' as const, services: filterAvailableServices(scanWorkspaceApps(tmp), existing) };
    } finally {
      await runQuiet('rm', ['-rf', assertInside(tmp, [APPS_DIR], 'diretório temporário')]);
    }
  }

  async create(dto: { name: string; repository: string; branch?: string; envVars?: string; generateSSL?: boolean; services: ServiceInput[] }) {
    if (!dto.services?.length) throw new BadRequestException('Informe ao menos um service');
    if (await this.prisma.project.findUnique({ where: { name: dto.name } })) {
      throw new ConflictException(`Projeto ${dto.name} já existe`);
    }
    // App names are global: prefix each service with the project name so two monorepos
    // that both have an `apps/web` don't collide. Already-prefixed names are kept as-is.
    const prefix = `${dto.name}-`;
    for (const s of dto.services) {
      if (!s.name.startsWith(prefix)) s.name = prefix + s.name;
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
    // Pre-flight, awaited: fails the request with a 400 instead of creating an App row
    // that a fire-and-forget deploy would later orphan silently.
    await this.deployService.assertReleaseReady(project, dto.appDir);

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
    const svc = project.apps.find((a) => a.id === appId);
    if (!svc) throw new NotFoundException('Service não encontrado neste projeto');
    // Pre-flight, awaited: same 400 the client would otherwise never see.
    await this.deployService.assertReleaseReady(project, svc.appDir);
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

    // Both supervisors are torn down regardless of activeRuntime: a service that moved
    // between runtimes can have leftovers on the other side, and a removal that leaves
    // a container holding the port breaks whatever is deployed there next.
    const svcName = assertSafeName(svc.name, 'nome do service');
    const projectName = assertSafeName(project.name, 'nome do projeto');

    await runQuiet('pm2', ['delete', svcName]);
    await removeApp(svcName).catch(() => undefined);
    await removeImages(svcName).catch(() => undefined);
    await sudoQuiet('rm', [
      '-f',
      path.join(NGINX_AVAILABLE, `${svcName}.conf`),
      path.join(NGINX_ENABLED, `${svcName}.conf`),
    ]);
    await sudoQuiet('rm', ['-rf', assertInside(path.join(WWW_DIR, svcName), [WWW_DIR], 'diretório estático')]);
    await runQuiet('rm', [
      '-f',
      path.join(APPS_DIR, projectName, `${svcName}.ecosystem.config.js`),
      path.join(APPS_DIR, projectName, `${svcName}.env`),
    ]);
    await runQuiet('pm2', ['save']);
    await sudoQuiet('systemctl', ['reload', 'nginx']);
    // AppMetric rows and this service's own Deploy rows (appId set) cascade on App delete
    // (onDelete: Cascade in schema.prisma). Project-level Deploy rows — including the
    // incremental deploys this service went through (projectId set, appId null) — are not
    // tied to the App and are retained under the Project, so its deploy history survives.
    await this.prisma.app.delete({ where: { id: appId } });
    return { success: true };
  }

  /**
   * Apaga releases de um projeto monorepo.
   *
   * ## Duas diferenças em relação ao app avulso
   *
   * 1. **Vários symlinks.** Cada service tem o próprio `current`. A release só é
   *    segura se não for o alvo de nenhum deles — não basta olhar o `isCurrent` da
   *    linha, que é um booleano e já se provou capaz de divergir do disco.
   * 2. **Linhas filhas.** Uma release de projeto grava uma linha por service, ligada
   *    pelo `parentId`. Como essa coluna não tem FK (adicioná-la no SQLite exigiria
   *    recriar a tabela de histórico inteira), a limpeza das filhas é feita aqui, em
   *    código. Sem isso sobrariam linhas órfãs apontando para um diretório que já não
   *    existe.
   */
  async deleteDeploys(id: string, ids: string[]) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { apps: { select: { name: true } } },
    });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException('Nenhuma release selecionada');

    // O `current` de cada service, lido do disco.
    const alvos = project.apps.map((app) => {
      try {
        const link = path.join(APPS_DIR, app.name, 'current');
        return fs.existsSync(link) ? fs.realpathSync(link) : null;
      } catch {
        return null;
      }
    });

    const releases = (await this.prisma.deploy.findMany({
      where: { projectId: id },
    })) as unknown as DeletableRelease[];

    const { toDelete, refused } = selectDeletable(releases, ids, alvos);

    let removidas = 0;
    const falhas = refused.map((r) => `${r.release.version}: ${r.reason}`);

    for (const release of toDelete) {
      try {
        if (release.path && fs.existsSync(release.path)) {
          const dir = assertInside(release.path, [APPS_DIR], 'diretório da release');
          await run('rm', ['-rf', dir]);
        }
        // As filhas primeiro: sem FK, apagar só a pai deixaria órfãs.
        await this.prisma.deploy.deleteMany({ where: { parentId: release.id } });
        await this.prisma.deploy.delete({ where: { id: release.id } });
        removidas++;
      } catch (error: any) {
        falhas.push(`${release.version}: ${error.message}`);
      }
    }

    await this.prisma.systemLog.create({
      data: {
        level: falhas.length ? 'warn' : 'info',
        message:
          `${removidas} release(s) removida(s) do projeto ${project.name}` +
          (falhas.length ? ` · ${falhas.length} recusada(s)` : ''),
        source: 'cleanup',
      },
    });

    return { removed: removidas, failed: falhas };
  }

  async rollback(id: string, deployId: string) {
    return this.deployService.rollbackProject(id, deployId);
  }

  /** Generate/refresh the Let's Encrypt certificate for every service of the project that has a domain. */
  async generateSsl(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { apps: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    const withDomain = project.apps.filter((a) => a.domain);
    if (withDomain.length === 0) {
      return { results: [], message: 'Nenhum service com domínio configurado' };
    }
    const results: Array<{ domain: string | null; ok: boolean; error?: string }> = [];
    for (const svc of withDomain) {
      results.push(await this.deployService.generateSslForApp(svc));
    }
    return { results };
  }

  async remove(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { apps: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    const projectName = assertSafeName(project.name, 'nome do projeto');

    for (const svc of project.apps) {
      const svcName = assertSafeName(svc.name, 'nome do service');
      await runQuiet('pm2', ['delete', svcName]);
      await removeApp(svcName).catch(() => undefined);
      await removeImages(svcName).catch(() => undefined);
      await sudoQuiet('rm', [
        '-f',
        path.join(NGINX_AVAILABLE, `${svcName}.conf`),
        path.join(NGINX_ENABLED, `${svcName}.conf`),
      ]);
      await sudoQuiet('rm', ['-rf', assertInside(path.join(WWW_DIR, svcName), [WWW_DIR], 'diretório estático')]);
    }
    await runQuiet('pm2', ['save']);
    await sudoQuiet('systemctl', ['reload', 'nginx']);
    await runQuiet('rm', [
      '-rf',
      assertInside(path.join(APPS_DIR, projectName), [APPS_DIR], 'diretório do projeto'),
    ]);
    await this.prisma.project.delete({ where: { id } });
    return { success: true };
  }
}
