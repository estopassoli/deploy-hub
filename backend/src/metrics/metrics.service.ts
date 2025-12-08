import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const COLLECT_INTERVAL = 30000; // 30 seconds
const RETENTION_HOURS = 24; // Keep 24 hours of data

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private collectInterval: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaService) {}

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
      const apps = await this.prisma.app.findMany({
        where: { type: { not: 'vitejs' } }, // Only collect for PM2-managed apps
      });

      const pm2Data = await this.getPM2Metrics();

      for (const app of apps) {
        const proc = pm2Data.find((p: any) => p.name === app.name);
        if (proc && proc.pm2_env?.status === 'online') {
          await this.prisma.appMetric.create({
            data: {
              appId: app.id,
              cpu: proc.monit?.cpu || 0,
              memory: Math.round((proc.monit?.memory || 0) / 1024 / 1024),
            },
          });
        }
      }
    } catch (error) {
      console.error('[MetricsService] Error collecting metrics:', error);
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
