import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeployGateway } from '../deploy/deploy.gateway';
import { EmailService } from '../email/email.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import { appState, appStats } from '../deploy/docker';

const execAsync = promisify(exec);
const COLLECT_INTERVAL = 30000; // 30 seconds
const RETENTION_HOURS = 24; // Keep 24 hours of data

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private collectInterval: NodeJS.Timeout | null = null;
  private previousAppStatuses: Map<string, string> = new Map();

  constructor(
    private prisma: PrismaService,
    private deployGateway: DeployGateway,
    private emailService: EmailService,
  ) {}

  onModuleInit() {
    // Start collecting metrics periodically
    this.collectInterval = setInterval(() => {
      this.collectAllMetrics();
    }, COLLECT_INTERVAL);

    // Collect immediately on startup
    this.collectAllMetrics();

    // Clean old metrics every hour
    setInterval(() => {
      this.cleanOldMetrics();
    }, 3600000);
  }

  onModuleDestroy() {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
    }
  }

  async collectAllMetrics() {
    try {
      // Static apps have no process to sample. Containerised ones do, whatever their
      // type: a dockerized Vite app is a running nginx, not files on disk.
      const apps = await this.prisma.app.findMany({
        where: { OR: [{ type: { not: 'vitejs' } }, { activeRuntime: 'docker' }] },
      });

      const pm2Data = await this.getPM2Metrics();

      for (const app of apps) {
        if (app.activeRuntime === 'docker') {
          await this.collectDockerMetrics(app);
          continue;
        }

        const proc = pm2Data.find((p: any) => p.name === app.name);
        const previousStatus = this.previousAppStatuses.get(app.id);
        const currentStatus = proc?.pm2_env?.status;

        // Detect if app stopped unexpectedly
        if (previousStatus === 'online' && currentStatus !== 'online') {
          console.log(`[MetricsService] App ${app.name} stopped unexpectedly`);
          this.deployGateway.emitAppStopped(app.name, 'Process exited unexpectedly');
          
          // Send email notification for app stopped
          this.emailService.notifyAppStopped(app.name, 'Process exited unexpectedly').catch(console.error);
          
          // Update app status in database
          await this.prisma.app.update({
            where: { id: app.id },
            data: { status: 'stopped' },
          });
          
          // Log to system logs
          await this.prisma.systemLog.create({
            data: {
              level: 'error',
              message: `Aplicação ${app.name} parou inesperadamente`,
              source: 'monitor',
              appId: app.id,
            },
          });
        }
        
        // Update previous status
        this.previousAppStatuses.set(app.id, currentStatus || 'stopped');
        
        if (proc && proc.pm2_env?.status === 'online' && proc.pid) {
          // Get real-time CPU using ps command
          let cpu = 0;
          let memory = Math.round((proc.monit?.memory || 0) / 1024 / 1024);
          
          try {
            const { stdout: psOutput } = await execAsync(`ps -p ${proc.pid} -o %cpu --no-headers`);
            cpu = parseFloat(psOutput.trim()) || 0;
          } catch {
            cpu = proc.monit?.cpu || 0;
          }

          await this.prisma.appMetric.create({
            data: {
              appId: app.id,
              cpu: Math.round(cpu * 10) / 10,
              memory,
            },
          });
        }
      }
    } catch (error) {
      console.error('[MetricsService] Error collecting metrics:', error);
    }
  }

  /**
   * Sample one containerised app and raise the same "stopped unexpectedly" alert the
   * PM2 path raises, so a crashed container is not silently invisible in the panel.
   */
  private async collectDockerMetrics(app: { id: string; name: string }) {
    const state = await appState(app.name);
    const previousStatus = this.previousAppStatuses.get(app.id);
    const currentStatus = state.running ? 'online' : 'stopped';

    if (previousStatus === 'online' && currentStatus !== 'online') {
      console.log(`[MetricsService] Container ${app.name} stopped unexpectedly`);
      this.deployGateway.emitAppStopped(app.name, 'Container exited unexpectedly');
      this.emailService.notifyAppStopped(app.name, 'Container exited unexpectedly').catch(console.error);
      await this.prisma.app.update({ where: { id: app.id }, data: { status: 'stopped' } });
      await this.prisma.systemLog.create({
        data: {
          level: 'error',
          message: `Container ${app.name} parou inesperadamente (${state.status})`,
          source: 'monitor',
          appId: app.id,
        },
      });
    }

    this.previousAppStatuses.set(app.id, currentStatus);

    if (state.running) {
      const { cpu, memory } = await appStats(app.name);
      await this.prisma.appMetric.create({ data: { appId: app.id, cpu, memory } });
    }
  }

  private async getPM2Metrics(): Promise<any[]> {
    try {
      const { stdout } = await execAsync('pm2 jlist');
      return JSON.parse(stdout);
    } catch {
      return [];
    }
  }

  async getAppMetrics(appId: string, hours: number = 1) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const metrics = await this.prisma.appMetric.findMany({
      where: {
        appId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        cpu: true,
        memory: true,
        createdAt: true,
      },
    });

    return metrics.map((m) => ({
      cpu: m.cpu,
      memory: m.memory,
      time: m.createdAt.toISOString(),
    }));
  }

  private async cleanOldMetrics() {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
    
    try {
      const result = await this.prisma.appMetric.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        console.log(`[MetricsService] Cleaned ${result.count} old metrics`);
      }
    } catch (error) {
      console.error('[MetricsService] Error cleaning old metrics:', error);
    }
  }
}
