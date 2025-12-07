import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppsService } from '../apps/apps.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
const APPS_DIR = process.env.APPS_DIR || '/root/apps';

@Injectable()
export class DeployService {
  constructor(
    private prisma: PrismaService,
    private appsService: AppsService,
  ) {}

  async deploy(data: { repository: string; name: string; port: number; domain?: string; type: string; branch?: string }) {
    // Create app if not exists
    let app = await this.prisma.app.findUnique({ where: { name: data.name } });
    
    if (!app) {
      app = await this.appsService.create(data as any);
    }

    return this.executeDeploy(app);
  }

  async redeploy(appId: string) {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new BadRequestException('App não encontrado');

    return this.executeDeploy(app);
  }

  private async executeDeploy(app: any) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    const releaseDir = path.join(APPS_DIR, app.name, 'releases', timestamp);
    const currentLink = path.join(APPS_DIR, app.name, 'current');

    // Create deploy record
    const deploy = await this.prisma.deploy.create({
      data: {
        appId: app.id,
        version: timestamp,
        path: releaseDir,
        status: 'building',
      },
    });

    // Update app status
    await this.prisma.app.update({
      where: { id: app.id },
      data: { status: 'deploying' },
    });

    try {
      // Clone repository
      await execAsync(`git clone --depth 1 --branch ${app.branch} ${app.repository} ${releaseDir}`);

      // Get commit info
      const { stdout: commitHash } = await execAsync(`cd ${releaseDir} && git rev-parse --short HEAD`);
      const { stdout: commitMessage } = await execAsync(`cd ${releaseDir} && git log -1 --pretty=%s`);

      await this.prisma.deploy.update({
        where: { id: deploy.id },
        data: { commitHash: commitHash.trim(), commitMessage: commitMessage.trim() },
      });

      // Install dependencies
      await execAsync(`cd ${releaseDir} && npm ci`);

      // Check for Prisma
      const hasPrisma = fs.existsSync(path.join(releaseDir, 'prisma', 'schema.prisma'));
      if (hasPrisma) {
        await execAsync(`cd ${releaseDir} && npx prisma generate`);
      }

      // Build based on type
      if (app.type === 'nestjs') {
        await execAsync(`cd ${releaseDir} && npm run build`);
      } else if (app.type === 'nextjs') {
        await execAsync(`cd ${releaseDir} && npm run build`);
      } else if (app.type === 'vitejs') {
        await execAsync(`cd ${releaseDir} && npm run build`);
      }

      // Update symlink
      await execAsync(`rm -f ${currentLink} && ln -s ${releaseDir} ${currentLink}`);

      // Start/restart PM2 (not for static)
      if (app.type !== 'vitejs') {
        const pm2Config = this.generatePM2Config(app, currentLink);
        const configPath = path.join(APPS_DIR, app.name, 'ecosystem.config.js');
        await fs.promises.writeFile(configPath, pm2Config);

        try {
          await execAsync(`pm2 delete ${app.name}`);
        } catch {}

        await execAsync(`pm2 start ${configPath}`);
        await execAsync('pm2 save');
      }

      // Update Nginx
      await this.updateNginxConfig(app);

      // Mark deploy as success
      await this.prisma.deploy.updateMany({ where: { appId: app.id }, data: { isCurrent: false } });
      await this.prisma.deploy.update({
        where: { id: deploy.id },
        data: { status: 'success', isCurrent: true },
      });

      await this.prisma.app.update({
        where: { id: app.id },
        data: { status: 'running', currentPath: releaseDir },
      });

      // Log success
      await this.prisma.systemLog.create({
        data: {
          level: 'info',
          message: `Deploy concluído: ${app.name} v${timestamp}`,
          source: 'deploy',
          appId: app.id,
        },
      });

      return { success: true, version: timestamp, deploy };
    } catch (error) {
      // Mark deploy as failed
      await this.prisma.deploy.update({
        where: { id: deploy.id },
        data: { status: 'failed', logs: error.message },
      });

      await this.prisma.app.update({
        where: { id: app.id },
        data: { status: 'error' },
      });

      await this.prisma.systemLog.create({
        data: {
          level: 'error',
          message: `Deploy falhou: ${app.name} - ${error.message}`,
          source: 'deploy',
          appId: app.id,
        },
      });

      throw new BadRequestException(`Deploy falhou: ${error.message}`);
    }
  }

  async checkPort(port: number) {
    const app = await this.prisma.app.findFirst({ where: { port } });
    const isSystemPort = port < 1024 || port === 10000 || port === 10001;

    return {
      available: !app && !isSystemPort,
      usedBy: app?.name,
      isSystemPort,
    };
  }

  async getDeployHistory() {
    return this.prisma.deploy.findMany({
      include: { app: { select: { name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private generatePM2Config(app: any, currentPath: string): string {
    const startScript = app.type === 'nestjs' 
      ? 'dist/main.js' 
      : app.type === 'nextjs' 
        ? 'node_modules/.bin/next start' 
        : null;

    if (!startScript) return '';

    return `
module.exports = {
  apps: [{
    name: '${app.name}',
    cwd: '${currentPath}',
    script: '${startScript}',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: ${app.port}
    }
  }]
};
`;
  }

  private async updateNginxConfig(app: any) {
    const config = app.type === 'vitejs'
      ? this.generateStaticNginxConfig(app)
      : this.generateProxyNginxConfig(app);

    const configPath = `/etc/nginx/sites-enabled/${app.name}.conf`;
    await fs.promises.writeFile(configPath, config);
    await execAsync('nginx -t && nginx -s reload');
  }

  private generateProxyNginxConfig(app: any): string {
    return `
server {
    listen 80;
    server_name ${app.domain || '_'};

    location / {
        proxy_pass http://127.0.0.1:${app.port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
  }

  private generateStaticNginxConfig(app: any): string {
    return `
server {
    listen 80;
    server_name ${app.domain || '_'};
    root ${APPS_DIR}/${app.name}/current/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
`;
  }
}
