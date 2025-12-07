import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppsService } from '../apps/apps.service';
import { DeployGateway } from './deploy.gateway';
import { exec, spawn } from 'child_process';
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
    private deployGateway: DeployGateway,
  ) {}

  private log(appName: string, message: string) {
    console.log(`[${appName}] ${message}`);
    this.deployGateway.emitDeployLog(appName, message);
  }

  async deploy(data: { repository: string; name: string; port: number; domain?: string; type: string; branch?: string; installCommand?: string; envVars?: string; generateSSL?: boolean }) {
    // Validate required fields
    if (!data.name || !data.repository || !data.port || !data.type) {
      throw new BadRequestException('Missing required fields: name, repository, port, type');
    }

    // Create app if not exists
    let app = await this.prisma.app.findUnique({ where: { name: data.name } });
    
    if (!app) {
      app = await this.appsService.create(data as any);
    }

    // Pass extra deploy options
    return this.executeDeploy(app, {
      installCommand: data.installCommand,
      envVars: data.envVars,
      generateSSL: data.generateSSL,
    });
  }

  async redeploy(appId: string) {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new BadRequestException('App não encontrado');

    return this.executeDeploy(app, {});
  }

  private async runCommand(command: string, cwd: string, appName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.log(appName, `$ ${command}`);
      
      const proc = spawn(command, [], { 
        cwd, 
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' }
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
            this.log(appName, `  │ ${line}`);
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
              this.log(appName, `  │ ❌ ${line}`);
            } else if (line.toLowerCase().includes('warn')) {
              this.log(appName, `  │ ⚠️ ${line}`);
            } else {
              this.log(appName, `  │ ${line}`);
            }
          }
        });
      });

      proc.on('close', (code) => {
        this.log(appName, `  └─ Exit code: ${code}`);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(errorOutput || `Command failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        this.log(appName, `  └─ Error: ${err.message}`);
        reject(err);
      });
    });
  }

  private async executeDeploy(app: any, options: { installCommand?: string; envVars?: string; generateSSL?: boolean } = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    const releaseDir = path.join(APPS_DIR, app.name, 'releases', timestamp);
    const currentLink = path.join(APPS_DIR, app.name, 'current');

    this.log(app.name, '▶ Starting deploy...');
    this.log(app.name, `  Version: ${timestamp}`);

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
      // Ensure apps directory exists
      await fs.promises.mkdir(path.join(APPS_DIR, app.name, 'releases'), { recursive: true });

      // Clone repository
      this.log(app.name, '▶ Cloning repository...');
      this.log(app.name, `  ${app.repository}`);
      this.log(app.name, `  Branch: ${app.branch}`);
      await execAsync(`git clone --depth 1 --branch ${app.branch} ${app.repository} ${releaseDir}`);
      this.log(app.name, '✓ Repository cloned');

      // Get commit info
      const { stdout: commitHash } = await execAsync(`cd ${releaseDir} && git rev-parse --short HEAD`);
      const { stdout: commitMessage } = await execAsync(`cd ${releaseDir} && git log -1 --pretty=%s`);

      this.log(app.name, `  Commit: ${commitHash.trim()} - ${commitMessage.trim().substring(0, 50)}`);

      await this.prisma.deploy.update({
        where: { id: deploy.id },
        data: { commitHash: commitHash.trim(), commitMessage: commitMessage.trim() },
      });

      // Write .env file if provided
      if (options.envVars) {
        this.log(app.name, '▶ Writing environment variables...');
        const envPath = path.join(releaseDir, '.env');
        await fs.promises.writeFile(envPath, options.envVars);
        this.log(app.name, '✓ Environment file created');
      }

      // Install dependencies
      this.log(app.name, '▶ Installing dependencies...');
      const installCmd = options.installCommand || 'npm ci --prefer-offline';
      this.log(app.name, `  Command: ${installCmd}`);
      await this.runCommand(installCmd, releaseDir, app.name);
      this.log(app.name, '✓ Dependencies installed');

      // Check for Prisma
      const hasPrisma = fs.existsSync(path.join(releaseDir, 'prisma', 'schema.prisma'));
      if (hasPrisma) {
        this.log(app.name, '▶ Generating Prisma client...');
        await this.runCommand('npx prisma generate', releaseDir, app.name);
        this.log(app.name, '✓ Prisma client generated');

        // Run migrations if available
        this.log(app.name, '▶ Running Prisma migrations...');
        try {
          await this.runCommand('npx prisma migrate deploy', releaseDir, app.name);
          this.log(app.name, '✓ Migrations applied');
        } catch (e) {
          this.log(app.name, '  ⚠ No migrations to apply or error');
        }
      }

      // Build based on type
      this.log(app.name, `▶ Building ${app.type} application...`);
      await this.runCommand('npm run build', releaseDir, app.name);
      this.log(app.name, '✓ Build completed');

      // Update symlink
      this.log(app.name, '▶ Updating symlink...');
      await execAsync(`rm -f ${currentLink} && ln -s ${releaseDir} ${currentLink}`);
      this.log(app.name, `✓ ${currentLink} → ${releaseDir}`);

      // Start/restart PM2 (not for static)
      if (app.type !== 'vitejs') {
        this.log(app.name, '▶ Starting PM2 process...');
        const pm2Config = this.generatePM2Config(app, currentLink);
        const configPath = path.join(APPS_DIR, app.name, 'ecosystem.config.js');
        await fs.promises.writeFile(configPath, pm2Config);

        try {
          await execAsync(`pm2 delete ${app.name}`);
          this.log(app.name, '  Stopped existing process');
        } catch {}

        await execAsync(`pm2 start ${configPath}`);
        await execAsync('pm2 save');
        this.log(app.name, `✓ PM2 process started on port ${app.port}`);
      } else {
        this.log(app.name, '  Static app - no PM2 process needed');
      }

      // Update Nginx
      this.log(app.name, '▶ Configuring Nginx...');
      await this.updateNginxConfig(app);
      this.log(app.name, `✓ Nginx configured${app.domain ? ` for ${app.domain}` : ''}`);

      // Generate SSL certificate with Certbot if requested
      if (options.generateSSL && app.domain) {
        this.log(app.name, '▶ Checking Certbot installation...');
        try {
          await execAsync('which certbot');
          this.log(app.name, '✓ Certbot is installed');
          
          this.log(app.name, '▶ Generating SSL certificate with Certbot...');
          await this.runCommand(`sudo certbot --nginx -d ${app.domain} --non-interactive --agree-tos --email admin@${app.domain}`, '/tmp', app.name);
          this.log(app.name, `✓ SSL certificate generated for ${app.domain}`);
        } catch (e) {
          if (e.message?.includes('which certbot')) {
            this.log(app.name, '  ❌ Certbot is not installed');
            this.log(app.name, '  To install: sudo apt install certbot python3-certbot-nginx');
          } else {
            this.log(app.name, `  ⚠️ Failed to generate SSL: ${e.message}`);
            this.log(app.name, '  You can manually run: sudo certbot --nginx -d ' + app.domain);
          }
        }
      } else if (options.generateSSL && !app.domain) {
        this.log(app.name, '  ⚠️ SSL generation skipped - no domain configured');
      }

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

      this.log(app.name, '');
      this.log(app.name, '🚀 Deploy completed successfully!');
      this.deployGateway.emitDeployComplete(app.name, true, { version: timestamp, deploy });

      return { success: true, version: timestamp, deploy };
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      
      this.log(app.name, '');
      this.log(app.name, `❌ Deploy failed: ${errorMessage}`);
      
      // Mark deploy as failed
      await this.prisma.deploy.update({
        where: { id: deploy.id },
        data: { status: 'failed', logs: errorMessage },
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

  private generatePM2Config(app: any, currentPath: string): string {
    // Use npm run start for all app types - more reliable than direct script paths
    const isSupported = ['nestjs', 'nextjs'].includes(app.type);
    if (!isSupported) return '';

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
    return `server {
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

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
`;
  }
}