import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const execAsync = promisify(exec);
const APPS_DIR = process.env.APPS_DIR || '/root/apps';

@Injectable()
export class AppsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const apps = await this.prisma.app.findMany({
      include: { deploys: { where: { isCurrent: true }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with PM2 status or static file check for Vite.js
    const enrichedApps = await Promise.all(
      apps.map(async (app) => {
        const currentDeploy = app.deploys[0];
        
        // For Vite.js apps, check if static files exist in /var/www
        if (app.type === 'vitejs') {
          const staticStatus = await this.getStaticAppStatus(app.name);
          return {
            ...app,
            status: staticStatus.status,
            uptime: staticStatus.uptime,
            cpu: 0,
            memory: 0,
            currentVersion: currentDeploy?.version || '-',
          };
        }
        
        // For PM2-managed apps (NestJS, Next.js)
        const pm2Status = await this.getPM2Status(app.name);
        return {
          ...app,
          status: pm2Status.status,
          uptime: pm2Status.uptime,
          cpu: pm2Status.cpu,
          memory: pm2Status.memory,
          currentVersion: currentDeploy?.version || '-',
        };
      })
    );

    return enrichedApps;
  }

  private async getStaticAppStatus(appName: string): Promise<{ status: string; uptime: string }> {
    try {
      // Check if /var/www/{appName}/index.html exists
      const staticPath = `/var/www/${appName}/index.html`;
      await fs.promises.access(staticPath, fs.constants.F_OK);
      
      // Get file modification time for uptime approximation
      const stats = await fs.promises.stat(staticPath);
      const uptimeMs = Date.now() - stats.mtimeMs;
      
      return {
        status: 'running',
        uptime: this.formatUptime(uptimeMs),
      };
    } catch {
      return {
        status: 'stopped',
        uptime: '-',
      };
    }
  }

  async findOne(id: string) {
    const app = await this.prisma.app.findUnique({
      where: { id },
      include: { deploys: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });

    if (!app) throw new NotFoundException('App não encontrado');

    const pm2Status = await this.getPM2Status(app.name);
    return { ...app, ...pm2Status };
  }

  async create(data: { name: string; type: string; port: number; domain?: string; repository: string; branch?: string }) {
    // Check if port is available
    const existingPort = await this.prisma.app.findFirst({ where: { port: data.port } });
    if (existingPort) {
      throw new ConflictException(`Porta ${data.port} já está em uso pelo app ${existingPort.name}`);
    }

    // Check if name is unique
    const existingName = await this.prisma.app.findFirst({ where: { name: data.name } });
    if (existingName) {
      throw new ConflictException(`App com nome ${data.name} já existe`);
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const app = await this.prisma.app.create({
      data: {
        name: data.name,
        type: data.type,
        port: data.port,
        domain: data.domain,
        repository: data.repository,
        branch: data.branch || 'main',
        webhookSecret,
      },
    });

    // Create app directory
    const appDir = path.join(APPS_DIR, app.name);
    await fs.promises.mkdir(path.join(appDir, 'releases'), { recursive: true });

    return app;
  }

  async update(id: string, data: { domain?: string; branch?: string; envVars?: string; installCommand?: string; buildCommand?: string; migrateCommand?: string; startCommand?: string }) {
    const app = await this.prisma.app.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('App não encontrado');

    console.log('[AppsService] Update received:', JSON.stringify({ id, data }, null, 2));

    // Build update data - only include fields that were explicitly sent
    const updateData: Record<string, any> = {};
    
    if (data.domain !== undefined) updateData.domain = data.domain || null;
    if (data.branch !== undefined) updateData.branch = data.branch || null;
    if (data.envVars !== undefined) updateData.envVars = data.envVars || null;
    if (data.installCommand !== undefined) updateData.installCommand = data.installCommand || null;
    if (data.buildCommand !== undefined) updateData.buildCommand = data.buildCommand || null;
    if (data.migrateCommand !== undefined) updateData.migrateCommand = data.migrateCommand || null;
    if (data.startCommand !== undefined) updateData.startCommand = data.startCommand || null;

    console.log('[AppsService] Update data to save:', JSON.stringify(updateData, null, 2));

    const updated = await this.prisma.app.update({
      where: { id },
      data: updateData,
    });

    console.log('[AppsService] Update result:', JSON.stringify(updated, null, 2));

    // Update Nginx config if domain changed
    if (data.domain && data.domain !== app.domain) {
      await this.updateNginxConfig(updated);
    }

    return updated;
  }

  async delete(id: string) {
    console.log('[AppsService] Delete requested for id:', id);
    
    const app = await this.prisma.app.findUnique({ where: { id } });
    if (!app) {
      console.log('[AppsService] App not found:', id);
      throw new NotFoundException('App não encontrado');
    }

    console.log('[AppsService] Deleting app:', app.name);

    // Stop PM2 process
    try {
      console.log('[AppsService] Stopping PM2 process:', app.name);
      await execAsync(`pm2 delete ${app.name}`);
      await execAsync('pm2 save');
    } catch (e) {
      console.log('[AppsService] PM2 delete error (may not exist):', e.message);
    }

    // Remove Nginx config
    try {
      console.log('[AppsService] Removing Nginx config:', app.name);
      await execAsync(`sudo rm -f /etc/nginx/sites-available/${app.name}.conf`);
      await execAsync(`sudo rm -f /etc/nginx/sites-enabled/${app.name}.conf`);
      await execAsync('sudo systemctl reload nginx');
    } catch (e) {
      console.log('[AppsService] Nginx remove error:', e.message);
    }

    // Remove app directory from ~/apps
    try {
      const appDir = path.join(APPS_DIR, app.name);
      console.log('[AppsService] Removing app directory:', appDir);
      await execAsync(`rm -rf ${appDir}`);
    } catch (e) {
      console.log('[AppsService] App directory remove error:', e.message);
    }

    // Remove /var/www/{app_name} directory (for static apps)
    try {
      console.log('[AppsService] Removing /var/www/' + app.name);
      await execAsync(`sudo rm -rf /var/www/${app.name}`);
    } catch (e) {
      console.log('[AppsService] /var/www remove error:', e.message);
    }

    console.log('[AppsService] Deleting from database:', id);
    await this.prisma.app.delete({ where: { id } });
    
    console.log('[AppsService] Delete completed successfully');
    return { success: true };
  }

  async start(id: string) {
    const app = await this.prisma.app.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('App não encontrado');

    if (app.type === 'vitejs') {
      // Static apps don't need PM2
      return { success: true, message: 'App estático servido pelo Nginx' };
    }

    try {
      // First try to start if process exists in PM2
      const { stdout: pm2List } = await execAsync('pm2 jlist');
      const processes = JSON.parse(pm2List);
      const existsInPM2 = processes.some((p: any) => p.name === app.name);

      if (existsInPM2) {
        // Process exists, just start it
        await execAsync(`pm2 start ${app.name}`);
      } else {
        // Process doesn't exist in PM2, need to start from path
        const currentPath = app.currentPath || path.join(APPS_DIR, app.name, 'current');
        
        // Check if the current symlink/directory exists
        try {
          await fs.promises.access(currentPath, fs.constants.F_OK);
        } catch {
          throw new Error(`App directory not found: ${currentPath}. Deploy the app first.`);
        }

        // Determine start command based on app type
        let startCmd: string;
        const cwd = currentPath;

        if (app.startCommand) {
          // Use custom start command if configured
          startCmd = `pm2 start "npm" --name "${app.name}" --cwd "${cwd}" -- run start`;
        } else if (app.type === 'nextjs') {
          startCmd = `pm2 start "node_modules/.bin/next" --name "${app.name}" --cwd "${cwd}" -- start --port ${app.port}`;
        } else if (app.type === 'nestjs') {
          startCmd = `pm2 start "npm" --name "${app.name}" --cwd "${cwd}" -- run start:prod`;
        } else {
          startCmd = `pm2 start "npm" --name "${app.name}" --cwd "${cwd}" -- run start`;
        }

        await execAsync(startCmd);
      }

      await execAsync('pm2 save');
      await this.prisma.app.update({ where: { id }, data: { status: 'running' } });
      return { success: true };
    } catch (error) {
      throw new Error(`Falha ao iniciar: ${error.message}`);
    }
  }

  async stop(id: string) {
    const app = await this.prisma.app.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('App não encontrado');

    try {
      await execAsync(`pm2 stop ${app.name}`);
      await this.prisma.app.update({ where: { id }, data: { status: 'stopped' } });
      return { success: true };
    } catch (error) {
      throw new Error(`Falha ao parar: ${error.message}`);
    }
  }

  async restart(id: string) {
    const app = await this.prisma.app.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('App não encontrado');

    try {
      await execAsync(`pm2 restart ${app.name}`);
      return { success: true };
    } catch (error) {
      throw new Error(`Falha ao reiniciar: ${error.message}`);
    }
  }

  async getVersions(id: string) {
    const app = await this.prisma.app.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('App não encontrado');

    return this.prisma.deploy.findMany({
      where: { appId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async rollback(id: string, deployId: string) {
    const app = await this.prisma.app.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('App não encontrado');

    const deploy = await this.prisma.deploy.findUnique({ where: { id: deployId } });
    if (!deploy || deploy.appId !== id) throw new NotFoundException('Deploy não encontrado');

    // Update current symlink
    const appDir = path.join(APPS_DIR, app.name);
    const currentLink = path.join(appDir, 'current');

    try {
      await execAsync(`rm -f ${currentLink} && ln -s ${deploy.path} ${currentLink}`);

      // Restart PM2 if needed
      if (app.type !== 'vitejs') {
        await execAsync(`pm2 restart ${app.name}`);
      }

      // Update deploy flags
      await this.prisma.deploy.updateMany({ where: { appId: id }, data: { isCurrent: false } });
      await this.prisma.deploy.update({ where: { id: deployId }, data: { isCurrent: true } });
      await this.prisma.app.update({ where: { id }, data: { currentPath: deploy.path } });

      return { success: true, version: deploy.version };
    } catch (error) {
      throw new Error(`Falha no rollback: ${error.message}`);
    }
  }

  private async getPM2Status(appName: string): Promise<{ status: string; uptime: string; cpu: number; memory: number }> {
    try {
      const { stdout } = await execAsync(`pm2 jlist`);
      const processes = JSON.parse(stdout);
      const proc = processes.find((p: any) => p.name === appName);

      if (!proc) {
        return { status: 'stopped', uptime: '-', cpu: 0, memory: 0 };
      }

      const uptimeMs = Date.now() - proc.pm2_env.pm_uptime;
      const uptime = this.formatUptime(uptimeMs);

      // Get real-time CPU and memory using ps command for more accurate values
      const pid = proc.pid;
      let cpu = 0;
      let memory = 0;

      if (pid) {
        try {
          // Use ps to get real CPU and memory usage
          const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o %cpu,%mem --no-headers`);
          const parts = psOutput.trim().split(/\s+/);
          if (parts.length >= 2) {
            cpu = parseFloat(parts[0]) || 0;
            // Memory from PM2 monit is more accurate (in bytes)
            memory = Math.round((proc.monit?.memory || 0) / 1024 / 1024);
          }
        } catch (psError) {
          // Fallback to PM2 monit values
          cpu = proc.monit?.cpu || 0;
          memory = Math.round((proc.monit?.memory || 0) / 1024 / 1024);
        }
      } else {
        cpu = proc.monit?.cpu || 0;
        memory = Math.round((proc.monit?.memory || 0) / 1024 / 1024);
      }

      // Round CPU to 1 decimal place
      cpu = Math.round(cpu * 10) / 10;

      return {
        status: proc.pm2_env.status === 'online' ? 'running' : proc.pm2_env.status,
        uptime,
        cpu,
        memory,
      };
    } catch (error) {
      console.error(`[PM2 Status] Error for ${appName}:`, error);
      return { status: 'stopped', uptime: '-', cpu: 0, memory: 0 };
    }
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
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
    server_name ${app.domain || app.name + '.localhost'};

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
    // Use /var/www/{app_name} for static files - better permissions for Nginx
    return `
server {
    listen 80;
    server_name ${app.domain || app.name + '.localhost'};
    root /var/www/${app.name};
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
`;
  }
}
