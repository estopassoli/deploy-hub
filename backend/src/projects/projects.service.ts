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
