
import { BadRequestException, Injectable } from '@nestjs/common';
import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { AppsService } from '../apps/apps.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeployGateway } from './deploy.gateway';
import {
  detectPackageManager,
  detectAppType,
  readPackageName,
  installCmd,
  runScriptCmd,
  execCmd,
  turboBuildCmd,
  turboBuildManyCmd,
  hardenedPath,
  resolveBin,
} from './package-manager';
import type { PmInfo } from './package-manager';
import { proxyVhostConfig, staticVhostConfig } from './nginx-config';

const execAsync = promisify(exec);
const APPS_DIR = process.env.APPS_DIR || '/root/apps';

@Injectable()
export class DeployService {
  constructor(
    private prisma: PrismaService,
    private appsService: AppsService,
    private deployGateway: DeployGateway,
    private emailService: EmailService,
  ) { }

  // Store logs per deploy for persistence
  private deployLogs: Map<string, string[]> = new Map();
  private currentPhase: Map<string, string> = new Map();

  private log(appName: string, message: string, deployId?: string) {
    console.log(`[${appName}] ${message}`);
    const phase = this.currentPhase.get(appName) || 'cloning';
    this.deployGateway.emitDeployLog(appName, message, phase);

    // Accumulate logs for persistence
    if (deployId) {
      if (!this.deployLogs.has(deployId)) {
        this.deployLogs.set(deployId, []);
      }
      this.deployLogs.get(deployId)!.push(`[${new Date().toISOString()}] ${message}`);
    }
  }

  private setPhase(appName: string, phase: string) {
    this.currentPhase.set(appName, phase);
  }

  private async persistLogs(deployId: string) {
    const logs = this.deployLogs.get(deployId);
    if (logs && logs.length > 0) {
      await this.prisma.deploy.update({
        where: { id: deployId },
        data: { logs: logs.join('\n') },
      });
      this.deployLogs.delete(deployId);
    }
  }

  async deploy(data: { repository: string; name: string; port: number; domain?: string; type: string; branch?: string; installCommand?: string; buildCommand?: string; migrateCommand?: string; startCommand?: string; appDir?: string; workspacePackage?: string; envVars?: string; generateSSL?: boolean }) {
    // Validate required fields
    if (!data.name || !data.repository || !data.port || !data.type) {
      throw new BadRequestException('Missing required fields: name, repository, port, type');
    }

    // Create app if not exists
    let app = await this.prisma.app.findUnique({ where: { name: data.name } });

    if (!app) {
      app = await this.appsService.create(data as any);
    }

    // Store envVars and commands in app for future redeploys
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

    // Pass extra deploy options
    return this.executeDeploy(app, {
      installCommand: data.installCommand,
      buildCommand: data.buildCommand,
      migrateCommand: data.migrateCommand,
      startCommand: data.startCommand,
      envVars: data.envVars,
      generateSSL: data.generateSSL,
    });
  }

  async redeploy(appId: string) {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new BadRequestException('App não encontrado');

    // If this app is a service of a monorepo Project, redeploy the whole project
    // (shared clone + layered project/service env). A standalone redeploy would clone
    // into APPS_DIR/<app> and use ONLY app.envVars, dropping the shared project.envVars
    // (REDIS_URL / JWT_* / ENCRYPTION_KEY / etc.) and breaking the service at boot.
    if (app.projectId) {
      return this.deployProject(app.projectId, {});
    }

    // Use stored envVars and commands from the app
    return this.executeDeploy(app, {
      envVars: app.envVars || undefined,
      installCommand: app.installCommand || undefined,
      buildCommand: app.buildCommand || undefined,
      migrateCommand: app.migrateCommand || undefined,
      startCommand: app.startCommand || undefined,
    });
  }

  /**
   * Obtain/refresh a Let's Encrypt certificate for an app's domain via certbot, then
   * rewrite its nginx vhost (which now includes the :443 block since the cert exists).
   * Idempotent — certbot reuses a valid existing cert. Never throws; returns a result.
   */
  async generateSslForApp(app: any): Promise<{ domain: string | null; ok: boolean; error?: string }> {
    if (!app.domain) return { domain: null, ok: false, error: 'sem domínio' };
    try {
      await execAsync('which certbot');
    } catch {
      return { domain: app.domain, ok: false, error: 'certbot não está instalado' };
    }
    const email = process.env.CERTBOT_EMAIL || `admin@${app.domain}`;
    try {
      this.log(app.name, `▶ Generating SSL for ${app.domain}...`);
      await this.runCommand(
        `sudo certbot --nginx -d ${app.domain} --non-interactive --agree-tos --email ${email}`,
        '/tmp',
        app.name,
      );
      // Normalize the vhost to our format (:80 + :443) now that the cert exists.
      await this.updateNginxConfig(app);
      this.log(app.name, `✓ SSL ready for ${app.domain}`);
      return { domain: app.domain, ok: true };
    } catch (e) {
      this.log(app.name, `❌ SSL failed for ${app.domain}: ${e.message}`);
      return { domain: app.domain, ok: false, error: e.message };
    }
  }

  private async runCommand(
    command: string,
    cwd: string,
    appName: string,
    deployId?: string,
    extraEnv?: Record<string, string>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.log(appName, `$ ${command}`, deployId);

      // The server's PATH goes AFTER the release's own binaries.
      //
      // These commands run through a shell, so every tool name is resolved by
      // PATH — and a deploy box usually has next, tsc, vite and eslint
      // installed globally. Without this, `next build` picks the global one; a
      // newer global Next run against the version the project installed fails
      // looking for an internal file that only exists in its own release.
      const basePath = extraEnv?.PATH || process.env.PATH || '';

      const proc = spawn(command, [], {
        cwd,
        shell: true,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          ...extraEnv,
          PATH: hardenedPath(cwd, basePath)
        }
      });

      let output = '';
      let errorOutput = '';

      // Stream stdout line by line in real-time
      proc.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;

        // Split by lines and send each one
        const lines = text.split('\n');
        lines.forEach((line: string) => {
          if (line.trim() || line === '') {
            this.log(appName, `  │ ${line}`, deployId);
          }
        });
      });

      // Stream stderr line by line in real-time
      proc.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;

        // Split by lines and send each one
        const lines = text.split('\n');
        lines.forEach((line: string) => {
          if (line.trim() || line === '') {
            // Color code warnings and errors
            if (line.toLowerCase().includes('error')) {
              this.log(appName, `  │ ❌ ${line}`, deployId);
            } else if (line.toLowerCase().includes('warn')) {
              this.log(appName, `  │ ⚠️ ${line}`, deployId);
            } else {
              this.log(appName, `  │ ${line}`, deployId);
            }
          }
        });
      });

      proc.on('close', (code) => {
        this.log(appName, `  └─ Exit code: ${code}`, deployId);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(errorOutput || `Command failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        this.log(appName, `  └─ Error: ${err.message}`, deployId);
        reject(err);
      });
    });
  }

  /**
   * Parse env vars string to object for use in commands
   */
  private parseEnvVars(envVars?: string): Record<string, string> {
    if (!envVars) return {};

    const envObj: Record<string, string> = {};
    const lines = envVars.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        envObj[key] = value;
      }
    }

    return envObj;
  }

  private async executeDeploy(app: any, options: { installCommand?: string; buildCommand?: string; migrateCommand?: string; startCommand?: string; envVars?: string; generateSSL?: boolean } = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    const releaseDir = path.join(APPS_DIR, app.name, 'releases', timestamp);
    const currentLink = path.join(APPS_DIR, app.name, 'current');

    // Parse env vars for use in commands
    const envVarsObj = this.parseEnvVars(options.envVars);

    // Create deploy record first to get ID for logging
    const deploy = await this.prisma.deploy.create({
      data: {
        appId: app.id,
        version: timestamp,
        path: releaseDir,
        status: 'building',
      },
    });

    this.log(app.name, '▶ Starting deploy...', deploy.id);
    this.log(app.name, `  Version: ${timestamp}`, deploy.id);

    if (options.envVars) {
      this.log(app.name, `  Environment variables: ${Object.keys(envVarsObj).length} defined`, deploy.id);
    }

    // Update app status
    await this.prisma.app.update({
      where: { id: app.id },
      data: { status: 'deploying' },
    });

    try {
      // Ensure apps directory exists
      await fs.promises.mkdir(path.join(APPS_DIR, app.name, 'releases'), { recursive: true });

      // Clone repository
      this.setPhase(app.name, 'cloning');
      this.log(app.name, '▶ Cloning repository...', deploy.id);
      this.log(app.name, `  ${app.repository}`, deploy.id);
      this.log(app.name, `  Branch: ${app.branch}`, deploy.id);
      await execAsync(`git clone --depth 1 --branch ${app.branch} ${app.repository} ${releaseDir}`);
      this.log(app.name, '✓ Repository cloned', deploy.id);

      // Get commit info
      const { stdout: commitHash } = await execAsync(`cd ${releaseDir} && git rev-parse --short HEAD`);
      const { stdout: commitMessage } = await execAsync(`cd ${releaseDir} && git log -1 --pretty=%s`);

      this.log(app.name, `  Commit: ${commitHash.trim()} - ${commitMessage.trim().substring(0, 50)}`, deploy.id);

      await this.prisma.deploy.update({
        where: { id: deploy.id },
        data: { commitHash: commitHash.trim(), commitMessage: commitMessage.trim() },
      });

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

      // Install dependencies with auto-recovery (pass env vars)
      this.setPhase(app.name, 'installing');
      this.log(app.name, '▶ Installing dependencies...', deploy.id);
      await this.installDependencies(releaseDir, app.name, pm, options.installCommand, deploy.id, envVarsObj);
      this.log(app.name, '✓ Dependencies installed', deploy.id);

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

      // Update symlink
      this.log(app.name, '▶ Updating symlink...', deploy.id);
      await execAsync(`rm -f ${currentLink} && ln -s ${releaseDir} ${currentLink}`);
      this.log(app.name, `✓ ${currentLink} → ${releaseDir}`, deploy.id);

      // Start/restart PM2 (not for static) - include env vars in PM2 config
      this.setPhase(app.name, 'starting');
      if (effectiveType !== 'vitejs') {
        this.log(app.name, '▶ Starting PM2 process...', deploy.id);
        const pm2Config = this.generatePM2Config(app, currentLink, envVarsObj, options.startCommand, {
          pm,
          pkg: isMonorepo ? pkg : undefined,
          effectiveType,
        });
        const configPath = path.join(APPS_DIR, app.name, 'ecosystem.config.js');
        await fs.promises.writeFile(configPath, pm2Config);

        try {
          await execAsync(`pm2 delete ${app.name}`);
          this.log(app.name, '  Stopped existing process', deploy.id);
        } catch { /* empty */ }

        await execAsync(`pm2 start ${configPath}`);
        await execAsync('pm2 save');
        this.log(app.name, `✓ PM2 process started on port ${app.port}`, deploy.id);
      } else {
        // For Vite.js static apps, copy dist to /var/www/{app_name}
        this.log(app.name, '▶ Copying dist to /var/www...', deploy.id);
        const wwwDir = `/var/www/${app.name}`;
        await execAsync(`sudo mkdir -p ${wwwDir}`);
        await execAsync(`sudo rm -rf ${wwwDir}/*`);
        const distDir = appDir ? `${currentLink}/${appDir}/dist` : `${currentLink}/dist`;
        await execAsync(`sudo cp -r ${distDir}/* ${wwwDir}/`);
        await execAsync(`sudo chown -R www-data:www-data ${wwwDir}`);
        await execAsync(`sudo chmod -R 755 ${wwwDir}`);
        this.log(app.name, `✓ Static files copied to ${wwwDir}`, deploy.id);
      }

      // Update Nginx
      this.setPhase(app.name, 'configuring');
      this.log(app.name, '▶ Configuring Nginx...', deploy.id);
      await this.updateNginxConfig(app);
      this.log(app.name, `✓ Nginx configured${app.domain ? ` for ${app.domain}` : ''}`, deploy.id);

      // Generate SSL certificate with Certbot if requested
      if (options.generateSSL && app.domain) {
        this.log(app.name, '▶ Checking Certbot installation...', deploy.id);
        try {
          await execAsync('which certbot');
          this.log(app.name, '✓ Certbot is installed', deploy.id);

          this.log(app.name, '▶ Generating SSL certificate with Certbot...', deploy.id);
          await this.runCommand(`sudo certbot --nginx -d ${app.domain} --non-interactive --agree-tos --email admin@${app.domain}`, '/tmp', app.name, deploy.id);
          this.log(app.name, `✓ SSL certificate generated for ${app.domain}`, deploy.id);
        } catch (e) {
          if (e.message?.includes('which certbot')) {
            this.log(app.name, '  ❌ Certbot is not installed', deploy.id);
            this.log(app.name, '  To install: sudo apt install certbot python3-certbot-nginx', deploy.id);
          } else {
            this.log(app.name, `  ⚠️ Failed to generate SSL: ${e.message}`, deploy.id);
            this.log(app.name, '  You can manually run: sudo certbot --nginx -d ' + app.domain, deploy.id);
          }
        }
      } else if (options.generateSSL && !app.domain) {
        this.log(app.name, '  ⚠️ SSL generation skipped - no domain configured', deploy.id);
      }

      // Mark deploy as success and persist logs
      await this.prisma.deploy.updateMany({ where: { appId: app.id }, data: { isCurrent: false } });

      this.log(app.name, '', deploy.id);
      this.log(app.name, '🚀 Deploy completed successfully!', deploy.id);

      // Persist all accumulated logs
      await this.persistLogs(deploy.id);

      await this.prisma.deploy.update({
        where: { id: deploy.id },
        data: { status: 'success', isCurrent: true },
      });

      await this.prisma.app.update({
        where: { id: app.id },
        data: { status: 'running', currentPath: releaseDir },
      });

      // Log success to system logs
      await this.prisma.systemLog.create({
        data: {
          level: 'info',
          message: `Deploy concluído: ${app.name} v${timestamp}`,
          source: 'deploy',
          appId: app.id,
        },
      });

      this.deployGateway.emitDeployComplete(app.name, true, { version: timestamp, deploy });

      // Send email notification for successful deploy
      this.emailService.notifyDeploySuccess(app.name, timestamp).catch(console.error);

      return { success: true, version: timestamp, deploy };
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';

      this.log(app.name, '', deploy.id);
      this.log(app.name, `❌ Deploy failed: ${errorMessage}`, deploy.id);

      // Persist all accumulated logs before marking as failed
      await this.persistLogs(deploy.id);

      // Mark deploy as failed
      await this.prisma.deploy.update({
        where: { id: deploy.id },
        data: { status: 'failed' },
      });

      await this.prisma.app.update({
        where: { id: app.id },
        data: { status: 'error' },
      });

      await this.prisma.systemLog.create({
        data: {
          level: 'error',
          message: `Deploy falhou: ${app.name} - ${errorMessage}`,
          source: 'deploy',
          appId: app.id,
        },
      });

      this.deployGateway.emitDeployComplete(app.name, false, { error: errorMessage });

      // Send email notification for failed deploy
      this.emailService.notifyDeployFailed(app.name, errorMessage).catch(console.error);

      throw new BadRequestException(`Deploy falhou: ${errorMessage}`);
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

  async getDeployLogs(deployId: string) {
    const deploy = await this.prisma.deploy.findUnique({
      where: { id: deployId },
      select: { id: true, version: true, status: true, logs: true, createdAt: true },
    });

    if (!deploy) {
      throw new BadRequestException('Deploy não encontrado');
    }

    return {
      id: deploy.id,
      version: deploy.version,
      status: deploy.status,
      logs: deploy.logs || 'No logs available for this deploy.',
      createdAt: deploy.createdAt,
    };
  }

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

  /**
   * Resolve the project's current release and assert the service's appDir exists in it.
   * Shared pre-flight for both deployProjectService and its callers — callers await this
   * BEFORE creating the App/dispatching the deploy, so a bad release surfaces as a 400 to
   * the client instead of failing silently inside a fire-and-forget deploy.
   * Throws the client-facing BadRequestException; returns the resolved releaseDir.
   */
  async assertReleaseReady(project: { name: string }, appDir: string | null): Promise<string> {
    const currentLink = path.join(APPS_DIR, project.name, 'current');
    let releaseDir: string;
    try {
      releaseDir = await fs.promises.realpath(currentLink);
    } catch {
      throw new BadRequestException('Projeto sem release atual. Rode Redeploy project primeiro.');
    }

    const svcDir = appDir ? path.join(releaseDir, appDir) : releaseDir;
    if (!fs.existsSync(svcDir)) {
      let commit = 'desconhecido';
      try {
        const { stdout } = await execAsync(`cd ${releaseDir} && git rev-parse --short HEAD`);
        commit = stdout.trim();
      } catch {
        /* release sem git */
      }
      throw new BadRequestException(
        `${appDir} não existe no release atual (commit ${commit}). Rode Redeploy project para trazer o código novo.`,
      );
    }
    return releaseDir;
  }

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
    const releaseDir = await this.assertReleaseReady(project, svc.appDir);
    const svcDir = svc.appDir ? path.join(releaseDir, svc.appDir) : releaseDir;

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
      if (svc.envVars && svc.appDir) {
        await fs.promises.writeFile(path.join(svcDir, '.env'), svc.envVars);
        this.log(key, `✓ [${svc.name}] .env → ${svc.appDir}/`, deploy.id);
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

      // Recompute the project's overall status from its apps now that this service is
      // marked 'running' — an incremental deploy that fixes the last broken service
      // should clear a stale 'error' left over from a failed full deploy.
      const projectApps = await this.prisma.app.findMany({ where: { projectId: project.id } });
      const projectStatus = projectApps.some((a) => a.status === 'error') ? 'error' : 'running';
      await this.prisma.project.update({ where: { id: project.id }, data: { status: projectStatus } });

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

  private generatePM2Config(
    app: any,
    currentPath: string,
    envVars?: Record<string, string>,
    customStartCommand?: string,
    scope?: { pm: PmInfo; pkg?: string; effectiveType: string },
  ): string {
    const effectiveType = scope?.effectiveType || app.type;
    const isSupported = ['nestjs', 'nextjs'].includes(effectiveType);
    if (!isSupported) return '';

    // In a monorepo the process starts from the app's dir, not the repo root.
    const appCwd = app.appDir ? path.join(currentPath, app.appDir) : currentPath;

    // Merge base env with user-provided env vars
    const baseEnv = {
      NODE_ENV: 'production',
      PORT: app.port,
    };
    const mergedEnv: Record<string, any> = { ...baseEnv, ...envVars };

    // Same PATH hardening the build steps get, but for the long-running process.
    //
    // PM2 does not go through runCommand: it starts from this file's `env`, so
    // without this a start command like `pnpm exec next start` resolves `next`
    // through the server's PATH and boots the global Next against a build made
    // by the version the project installed. Paths go through the `current`
    // symlink so they survive a redeploy.
    mergedEnv.PATH = hardenedPath(appCwd, envVars?.PATH || process.env.PATH || '', currentPath);

    // Convert env object to JS object string
    const envString = Object.entries(mergedEnv)
      .map(([key, value]) => {
        // Quote string values, leave numbers as-is
        const formattedValue = typeof value === 'number' ? value : `'${String(value).replace(/'/g, "\\'")}'`;
        return `      ${key}: ${formattedValue}`;
      })
      .join(',\n');

    // If custom start command is provided, use it
    if (customStartCommand) {
      // Parse the command - could be "npm run start:prod" or "node dist/main.js" etc.
      const parts = customStartCommand.split(' ');
      const script = parts[0];
      const args = parts.slice(1).join(' ');

      return `
module.exports = {
  apps: [{
    name: '${app.name}',
    cwd: '${appCwd}',
    script: '${script}',
    args: '${args}',
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
    cwd: '${appCwd}',
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

    // Para Next.js, usa comando direto para garantir que a porta configurada prevalece
    // sobre qualquer --port hardcoded no package.json
    if (effectiveType === 'nextjs') {
      return `
module.exports = {
  apps: [{
    name: '${app.name}',
    cwd: '${appCwd}',
    script: '${resolveBin('next', appCwd, currentPath)}',
    args: 'start --port ${app.port}',
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

    // Single-app NestJS/other: run the start script via the detected package manager.
    const startCmd = runScriptCmd(scope?.pm || { name: 'npm', berry: false, viaCorepack: false }, { script: 'start' });
    const [startScript, ...startRest] = startCmd.split(' ');
    return `
module.exports = {
  apps: [{
    name: '${app.name}',
    cwd: '${appCwd}',
    script: '${startScript}',
    args: '${startRest.join(' ')}',
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
  };
  // Move the following methods inside the DeployService class

  private async updateNginxConfig(app: any) {
    // Preserve HTTPS across redeploys: if a Let's Encrypt cert already exists for this
    // domain, regenerate the vhost WITH the :443 ssl block instead of an HTTP-only
    // config (which would wipe certbot's SSL and make the domain fall through to the
    // 443 default_server — i.e. another app).
    const hasCert = Boolean(app.domain && fs.existsSync(`/etc/letsencrypt/live/${app.domain}/fullchain.pem`));
    const config = app.type === 'vitejs'
      ? staticVhostConfig({ domain: app.domain, appName: app.name, hasCert })
      : proxyVhostConfig({ domain: app.domain, port: app.port, hasCert });

    const configPath = `/etc/nginx/sites-available/${app.name}.conf`;
    const enabledPath = `/etc/nginx/sites-enabled/${app.name}.conf`;

    // Write config to sites-available first
    const tempPath = `/tmp/${app.name}.nginx.conf`;
    await fs.promises.writeFile(tempPath, config);
    this.log(app.name, `  Writing config to ${configPath}${hasCert ? ' (with HTTPS)' : ''}`);

    // Move to sites-available with sudo
    await execAsync(`sudo mv ${tempPath} ${configPath}`);

    // Create symlink in sites-enabled
    await execAsync(`sudo rm -f ${enabledPath}`);
    await execAsync(`sudo ln -s ${configPath} ${enabledPath}`);
    this.log(app.name, `  Symlink created: ${enabledPath}`);

    // Test and reload nginx
    await execAsync('sudo nginx -t');
    this.log(app.name, '  Nginx config test passed');
    await execAsync('sudo systemctl reload nginx');
  }
}