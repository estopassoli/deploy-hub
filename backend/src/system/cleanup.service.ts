import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import { assertInside } from '../common/paths';
import { run } from '../common/run';
import { SettingsService } from './settings.service';

const APPS_DIR = process.env.APPS_DIR || '/root/apps';

@Injectable()
export class CleanupService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldReleases() {
    // Retenção e liga/desliga agora vêm da tabela Setting, alimentada pela tela
    // /settings. Antes eram uma constante no código, enquanto a UI fingia configurá-las.
    const { retentionDays, autoCleanup } = await this.settings.getGeneral();

    if (!autoCleanup) {
      console.log('🧹 Limpeza automática desligada nas configurações — nada a fazer.');
      return;
    }

    console.log(`🧹 Iniciando limpeza de releases com mais de ${retentionDays} dias...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Get old deploys that are not current
    const oldDeploys = await this.prisma.deploy.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        isCurrent: false,
      },
      include: { app: true, project: true },
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
            // Uma release de projeto monorepo tem `appId` nulo e `projectId`
            // preenchido: olhar só para `deploy.app` fazia toda release de projeto
            // virar "unknown/<versão>" no log.
            message: `Release antiga removida: ${deploy.app?.name ?? deploy.project?.name ?? 'desconhecido'}/${deploy.version}`,
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
    const { retentionDays, autoCleanup } = await this.settings.getGeneral();
    if (!autoCleanup) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.systemLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });

    console.log(`🧹 ${result.count} logs antigos removidos.`);
  }
}
