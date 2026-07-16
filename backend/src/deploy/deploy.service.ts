
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
} from './package-manager';
import type { PmInfo } from './package-manager';

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

    // Use stored envVars and commands from the app
    return this.executeDeploy(app, {
      envVars: app.envVars || undefined,
      installCommand: app.installCommand || undefined,
      buildCommand: app.buildCommand || undefined,
      migrateCommand: app.migrateCommand || undefined,
      startCommand: app.startCommand || undefined,
    });
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

      const proc = spawn(command, [], {
        cwd,
        shell: true,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          ...extraEnv
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
      if (app.type !== 'vitejs') {
        this.log(app.name, '▶ Starting PM2 process...', deploy.id);
        const pm2Config = this.generatePM2Config(app, currentLink, envVarsObj, options.startCommand);
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
        await execAsync(`sudo cp -r ${currentLink}/dist/* ${wwwDir}/`);
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

  private generatePM2Config(app: any, currentPath: string, envVars?: Record<string, string>, customStartCommand?: string): string {
    const isSupported = ['nestjs', 'nextjs'].includes(app.type);
    if (!isSupported) return '';

    // Merge base env with user-provided env vars
    const baseEnv = {
      NODE_ENV: 'production',
      PORT: app.port,
    };
    const mergedEnv = { ...baseEnv, ...envVars };

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
    cwd: '${currentPath}',
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

    // Para Next.js, usa comando direto para garantir que a porta configurada prevalece
    // sobre qualquer --port hardcoded no package.json
    if (app.type === 'nextjs') {
      return `
module.exports = {
  apps: [{
    name: '${app.name}',
    cwd: '${currentPath}',
    script: 'node_modules/.bin/next',
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

    // Para NestJS e outros, usa npm run start
    return `
module.exports = {
  apps: [{
    name: '${app.name}',
    cwd: '${currentPath}',
    script: 'npm',
    args: 'run start',
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
    const config = app.type === 'vitejs'
      ? this.generateStaticNginxConfig(app)
      : this.generateProxyNginxConfig(app);

    const configPath = `/etc/nginx/sites-available/${app.name}.conf`;
    const enabledPath = `/etc/nginx/sites-enabled/${app.name}.conf`;

    // Write config to sites-available first
    const tempPath = `/tmp/${app.name}.nginx.conf`;
    await fs.promises.writeFile(tempPath, config);
    this.log(app.name, `  Writing config to ${configPath}`);

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

  private generateProxyNginxConfig(app: any): string {
    return `server {
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
        proxy_read_timeout 86400;
    }
}
`;
  }

  private generateStaticNginxConfig(app: any): string {
    // Use /var/www/{app_name} for static files - better permissions for Nginx
    return `server {
    listen 80;
    server_name ${app.domain || '_'};
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