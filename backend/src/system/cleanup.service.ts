import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import { assertInside } from '../common/paths';
import { run } from '../common/run';

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
        //
        // `deploy.path` vem do banco e este job roda sozinho às 3h da manhã, sobre
        // linhas que ninguém revisou. O assertInside recusa qualquer caminho que não
        // esteja debaixo de APPS_DIR — inclusive o próprio APPS_DIR — antes de um
        // `rm -rf` rodando como root.
        if (deploy.path && fs.existsSync(deploy.path)) {
          const releaseDir = assertInside(deploy.path, [APPS_DIR], 'diretório da release');
          await run('rm', ['-rf', releaseDir]);
          console.log(`Removido: ${releaseDir}`);
        }

        // Delete from database
        await this.prisma.deploy.delete({ where: { id: deploy.id } });

        // Log
        await this.prisma.systemLog.create({
          data: {
            level: 'info',
            message: `Release antiga removida: ${deploy.app?.name ?? 'unknown'}/${deploy.version}`,
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
