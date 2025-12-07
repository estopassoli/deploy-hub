import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
const APPS_DIR = process.env.APPS_DIR || '/root/apps';
const RETENTION_DAYS = 30;

@Injectable()
export class CleanupService {
  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldReleases() {
    console.log('🧹 Iniciando limpeza de releases antigas...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    // Get old deploys that are not current
    const oldDeploys = await this.prisma.deploy.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        isCurrent: false,
      },
      include: { app: true },
    });

    for (const deploy of oldDeploys) {
      try {
        // Remove directory
        if (deploy.path && fs.existsSync(deploy.path)) {
          await execAsync(`rm -rf ${deploy.path}`);
          console.log(`Removido: ${deploy.path}`);
        }

        // Delete from database
        await this.prisma.deploy.delete({ where: { id: deploy.id } });

        // Log
        await this.prisma.systemLog.create({
          data: {
            level: 'info',
            message: `Release antiga removida: ${deploy.app.name}/${deploy.version}`,
            source: 'cleanup',
            appId: deploy.appId,
          },
        });
      } catch (error) {
        console.error(`Erro ao limpar ${deploy.path}:`, error.message);
        await this.prisma.systemLog.create({
          data: {
            level: 'error',
            message: `Falha ao limpar release: ${deploy.path} - ${error.message}`,
            source: 'cleanup',
            appId: deploy.appId,
          },
        });
      }
    }

    console.log(`🧹 Limpeza concluída. ${oldDeploys.length} releases removidas.`);
  }

  // Also clean up old system logs (older than 30 days)
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupOldLogs() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    const result = await this.prisma.systemLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });

    console.log(`🧹 ${result.count} logs antigos removidos.`);
  }
}
