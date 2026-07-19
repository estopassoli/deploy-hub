import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { DeployService } from '../deploy/deploy.service';
import { detectPackageManager } from '../deploy/package-manager';
import { scanWorkspaceApps, filterAvailableServices } from './workspace-scan';

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
