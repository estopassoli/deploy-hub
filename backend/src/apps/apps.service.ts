import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { proxyVhostConfig, staticVhostConfig } from '../deploy/nginx-config';
import {
  appState,
  appStats,
  removeApp,
  removeImages,
  stopApp,
  startApp as startContainers,
  restartApp as restartContainers,
  detectDockerAssets,
  composeBin,
  composeUpCmd,
  runContainerCmd,
  containerName,
  imageTag,
  imageExists,
  parseExposedPort,
} from '../deploy/docker';

const execAsync = promisify(exec);
const APPS_DIR = process.env.APPS_DIR || '/root/apps';

/** True when the app is supervised by Docker rather than PM2 or plain static files. */
function isDocker(app: { activeRuntime?: string | null }): boolean {
  return app.activeRuntime === 'docker';
}

@Injectable()
export class AppsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const apps = await this.prisma.app.findMany({
      include: { deploys: { where: { isCurrent: true }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with runtime status: containers, PM2 processes or static files on disk.
    const enrichedApps = await Promise.all(
      apps.map(async (app) => {
        const currentDeploy = app.deploys[0];

        if (isDocker(app)) {
          const dockerStatus = await this.getDockerStatus(app.name);
          return {
            ...app,
            ...dockerStatus,
            currentVersion: currentDeploy?.version || '-',
          };
        }

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

    const status = isDocker(app)
      ? await this.getDockerStatus(app.name)
      : await this.getPM2Status(app.name);
    return { ...app, ...status };
  }

  /**
   * Status of a containerised app, in the same shape the PM2 path returns.
   *
   * Uptime comes from the container's StartedAt rather than a counter we keep: a
   * container restarted by `--restart unless-stopped` reports the new start time, which
   * is exactly the number an operator expects to see.
   */
  private async getDockerStatus(
    appName: string,
  ): Promise<{ status: string; uptime: string; cpu: number; memory: number }> {
    const state = await appState(appName);
    if (state.count === 0) {
      return { status: 'stopped', uptime: '-', cpu: 0, memory: 0 };
    }
    if (!state.running) {
      return { status: state.status === 'restarting' ? 'error' : 'stopped', uptime: '-', cpu: 0, memory: 0 };
    }
    const { cpu, memory } = await appStats(appName);
    const startedAt = state.startedAt ? Date.parse(state.startedAt) : NaN;
    return {
      status: 'running',
      uptime: Number.isFinite(startedAt) ? this.formatUptime(Date.now() - startedAt) : '-',
      cpu,
      memory,
    };
  }

  async create(data: { name: string; type: string; port: number; domain?: string; repository: string; branch?: string; appDir?: string; workspacePackage?: string }) {
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
        appDir: data.appDir || null,
        workspacePackage: data.workspacePackage || null,
        webhookSecret,
      },
    });

    // Create app directory
    const appDir = path.join(APPS_DIR, app.name);
    await fs.promises.mkdir(path.join(appDir, 'releases'), { recursive: true });

    return app;
  }

  async update(id: string, data: { domain?: string; branch?: string; envVars?: string; installCommand?: string; buildCommand?: string; migrateCommand?: string; startCommand?: string; appDir?: string; workspacePackage?: string; runtime?: string; containerPort?: number | string | null; dockerContext?: string }) {
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
    if (data.appDir !== undefined) updateData.appDir = data.appDir || null;
    if (data.workspacePackage !== undefined) updateData.workspacePackage = data.workspacePackage || null;
    // runtime is NOT NULL with a default; an empty value means "back to auto" rather
    // than null, which would violate the column.
    if (data.runtime !== undefined) {
      const runtime = String(data.runtime || 'auto');
      if (!['auto', 'pm2', 'docker'].includes(runtime)) {
        throw new ConflictException(`Runtime inválido: ${runtime}. Use auto, pm2 ou docker.`);
      }
      updateData.runtime = runtime;
    }
    if (data.containerPort !== undefined) {
      const port = data.containerPort === null || data.containerPort === '' ? null : Number(data.containerPort);
      if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
        throw new ConflictException(`Container port inválida: ${data.containerPort}`);
      }
      updateData.containerPort = port;
    }
    if (data.dockerContext !== undefined) updateData.dockerContext = data.dockerContext || null;

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

    // Stop whatever is supervising it. Both are attempted regardless of activeRuntime:
    // an app that moved between runtimes can have leftovers on the other side, and the
    // whole point of a delete is to leave nothing holding the port.
    try {
      console.log('[AppsService] Stopping PM2 process:', app.name);
      await execAsync(`pm2 delete ${app.name}`);
      await execAsync('pm2 save');
    } catch (e) {
      console.log('[AppsService] PM2 delete error (may not exist):', e.message);
    }

    try {
      console.log('[AppsService] Removing containers and images:', app.name);
      await removeApp(app.name);
      await removeImages(app.name);
    } catch (e) {
      console.log('[AppsService] Docker cleanup error:', e.message);
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

    if (isDocker(app)) {
      try {
        await startContainers(app.name);
        await this.prisma.app.update({ where: { id }, data: { status: 'running' } });
        return { success: true };
      } catch (error) {
        throw new Error(`Falha ao iniciar: ${error.message}`);
      }
    }

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
      if (isDocker(app)) {
        await stopApp(app.name);
      } else {
        await execAsync(`pm2 stop ${app.name}`);
      }
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
      if (isDocker(app)) {
        await restartContainers(app.name);
      } else {
        await execAsync(`pm2 restart ${app.name}`);
      }
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

      if (isDocker(app)) {
        await this.rollbackDocker(app, deploy);
      } else if (app.type !== 'vitejs') {
        // Restart PM2 if needed
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

  /**
   * Put a containerised app back on an older release.
   *
   * Moving the `current` symlink is meaningless for a container: its code came from an
   * image, not from the release directory. Each deploy leaves its image tagged with the
   * release version, so rolling back is running that exact tag again — the same bits
   * that were serving before, with none of a rebuild's risk of picking up a moved
   * upstream dependency.
   *
   * Compose owns its own containers and ports, so there we re-apply the old release's
   * compose file instead.
   */
  private async rollbackDocker(app: any, deploy: { path: string; version: string }) {
    const workDir = app.appDir ? path.join(deploy.path, app.appDir) : deploy.path;
    const assets = detectDockerAssets(workDir, deploy.path);
    const envFile = path.join(APPS_DIR, app.name, `${app.name}.env`);

    if (assets.composeFile) {
      const bin = await composeBin();
      if (!bin) throw new Error('compose não está disponível neste host');
      await execAsync(composeUpCmd(bin, { project: app.name, file: assets.composeFile }), {
        cwd: path.dirname(assets.composeFile),
      });
      return;
    }

    const tag = imageTag(app.name, deploy.version);
    if (!(await imageExists(tag))) {
      throw new Error(
        `A imagem ${tag} não existe mais neste host (provavelmente removida por um docker prune). Refaça o deploy do commit desejado.`,
      );
    }

    let containerPort: number = app.containerPort || 0;
    if (!containerPort && assets.dockerfile) {
      containerPort = parseExposedPort(await fs.promises.readFile(assets.dockerfile, 'utf-8').catch(() => '')) || 0;
    }
    if (!containerPort) containerPort = app.port;

    await removeApp(app.name);
    await execAsync(
      runContainerCmd({
        name: containerName(app.name),
        image: tag,
        hostPort: app.port,
        containerPort,
        envFile: fs.existsSync(envFile) ? envFile : null,
      }),
    );
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
    // Same SSL-preserving behavior as the deploy path: keep the certbot :443 block
    // across config regenerations when a Let's Encrypt cert exists for the domain.
    const hasCert = Boolean(app.domain && fs.existsSync(`/etc/letsencrypt/live/${app.domain}/fullchain.pem`));
    // A Vite app running in a container serves its own files — only a genuinely static
    // deploy gets the /var/www root.
    const isStatic = app.activeRuntime ? app.activeRuntime === 'static' : app.type === 'vitejs';
    const config = isStatic
      ? staticVhostConfig({ domain: app.domain, appName: app.name, hasCert })
      : proxyVhostConfig({ domain: app.domain, port: app.port, hasCert });

    const configPath = `/etc/nginx/sites-enabled/${app.name}.conf`;
    await fs.promises.writeFile(configPath, config);
    await execAsync('nginx -t && nginx -s reload');
  }
}
