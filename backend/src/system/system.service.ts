import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as os from 'os';
import { run } from '../common/run';
import { parseCpuUsage, parseDiskUsage } from './system-parse';

interface UpdateEmailSettingsDto {
  emailEnabled: boolean;
  // `null` é o que o DTO produz quando o campo vem vazio (veja system.dto.ts).
  emailRecipient?: string | null;
}

@Injectable()
export class SystemService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [apps, deploys, runningApps] = await Promise.all([
      this.prisma.app.count(),
      this.prisma.deploy.count(),
      this.prisma.app.count({ where: { status: 'running' } }),
    ]);

    const stoppedApps = await this.prisma.app.count({ where: { status: 'stopped' } });

    // Get system metrics
    const cpuUsage = await this.getCpuUsage();
    const memoryUsage = this.getMemoryUsage();
    const diskUsage = await this.getDiskUsage();

    return {
      totalApps: apps,
      runningApps,
      stoppedApps,
      totalDeploys: deploys,
      cpuUsage,
      memoryUsage,
      diskUsage,
    };
  }

  /**
   * Configurações de notificação.
   *
   * As credenciais **não** são devolvidas: um webhook do Slack é um segredo — quem
   * tiver a URL pode postar no canal — e o token do Telegram controla o bot inteiro.
   * A UI recebe só um booleano dizendo se cada canal está configurado, o que é o
   * suficiente para desenhar a tela.
   */
  async getNotificationSettings() {
    const settings = await this.ensureSettings();
    return {
      slackConfigured: Boolean(settings.slackWebhook),
      discordConfigured: Boolean(settings.discordWebhook),
      telegramConfigured: Boolean(settings.telegramBotToken && settings.telegramChatId),
      emailConfigured: Boolean(settings.emailEnabled && settings.emailRecipient),
      notifyDeployFailed: settings.notifyDeployFailed,
      notifyDeploySuccess: settings.notifyDeploySuccess,
      notifyRollback: settings.notifyRollback,
      notifyAppDown: settings.notifyAppDown,
      notifySslExpiring: settings.notifySslExpiring,
    };
  }

  async updateNotificationSettings(dto: Record<string, unknown>) {
    const settings = await this.ensureSettings();

    const data: Record<string, unknown> = {};
    for (const campo of [
      'slackWebhook',
      'discordWebhook',
      'telegramBotToken',
      'telegramChatId',
      'notifyDeployFailed',
      'notifyDeploySuccess',
      'notifyRollback',
      'notifyAppDown',
      'notifySslExpiring',
    ]) {
      if (dto[campo] !== undefined) data[campo] = dto[campo];
    }

    await this.prisma.systemSettings.update({ where: { id: settings.id }, data });
    return this.getNotificationSettings();
  }

  /** Garante que a linha singleton de configurações existe. */
  private async ensureSettings() {
    const existente = await this.prisma.systemSettings.findFirst();
    if (existente) return existente;
    return this.prisma.systemSettings.create({ data: { emailEnabled: false, emailRecipient: null } });
  }

  /** Remove todas as linhas de SystemLog. Não toca em deploys nem em métricas. */
  async clearSystemLogs(): Promise<{ removed: number }> {
    const { count } = await this.prisma.systemLog.deleteMany({});
    return { removed: count };
  }

  async getSettings() {
    let settings = await this.prisma.systemSettings.findFirst();
    
    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: {
          emailEnabled: false,
          emailRecipient: null,
        },
      });
    }

    return {
      emailEnabled: settings.emailEnabled,
      emailRecipient: settings.emailRecipient,
      slackWebhook: settings.slackWebhook,
    };
  }

  async updateEmailSettings(dto: UpdateEmailSettingsDto) {
    let settings = await this.prisma.systemSettings.findFirst();

    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: {
          emailEnabled: dto.emailEnabled,
          emailRecipient: dto.emailRecipient || null,
        },
      });
    } else {
      settings = await this.prisma.systemSettings.update({
        where: { id: settings.id },
        data: {
          emailEnabled: dto.emailEnabled,
          emailRecipient: dto.emailRecipient || null,
        },
      });
    }

    return {
      emailEnabled: settings.emailEnabled,
      emailRecipient: settings.emailRecipient,
    };
  }

  private async getCpuUsage(): Promise<number> {
    // Era `top -bn1 | grep 'Cpu(s)' | awk '{print $2}'`. Sem o pipeline de shell, e
    // lendo o idle em vez da coluna 2 — que muda de posição conforme o locale e a
    // versão do procps, e por isso às vezes devolvia o número errado.
    try {
      const { stdout } = await run('top', ['-bn1'], { timeout: 10_000 });
      const usage = parseCpuUsage(stdout);
      if (usage !== null) return usage;
    } catch {
      /* cai no fallback do módulo os */
    }

    const cpus = os.cpus();
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce((acc, cpu) =>
      acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq, 0
    );
    if (!totalTick) return 0;
    return Math.round(100 - (totalIdle / totalTick * 100));
  }

  private getMemoryUsage(): number {
    const total = os.totalmem();
    const free = os.freemem();
    return Math.round(((total - free) / total) * 100);
  }

  private async getDiskUsage(): Promise<number> {
    // Era `df -h / | tail -1 | awk '{print $5}'`. O `-P` garante uma linha por
    // sistema de arquivos mesmo com nome de device longo; sem ele o df quebra a
    // linha e a coluna 5 some.
    try {
      const { stdout } = await run('df', ['-P', '/'], { timeout: 10_000 });
      return parseDiskUsage(stdout) ?? 0;
    } catch {
      return 0;
    }
  }
}
