import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BackupSettings,
  GeneralSettings,
  SETTING_KEYS,
  toBackupSettings,
  toGeneralSettings,
  validateBackupRetentionDays,
  validateRetentionDays,
} from './settings';

/**
 * Leitura e escrita das configurações operacionais na tabela `Setting`.
 *
 * Ver `settings.ts` para o contexto: o modelo existia e nunca era lido, enquanto a tela
 * de configurações fingia salvar.
 */
@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getGeneral(): Promise<GeneralSettings> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: Object.values(SETTING_KEYS) } },
      select: { key: true, value: true },
    });
    return toGeneralSettings(rows);
  }

  async updateGeneral(input: { retentionDays?: unknown; autoCleanup?: unknown }): Promise<GeneralSettings> {
    if (input.retentionDays !== undefined) {
      const dias = validateRetentionDays(input.retentionDays);
      await this.upsert(SETTING_KEYS.retentionDays, String(dias));
    }

    if (input.autoCleanup !== undefined) {
      await this.upsert(SETTING_KEYS.autoCleanup, input.autoCleanup ? 'true' : 'false');
    }

    return this.getGeneral();
  }

  async getBackup(): Promise<BackupSettings> {
    const rows = await this.prisma.setting.findMany({
      where: {
        key: {
          in: [SETTING_KEYS.backupEnabled, SETTING_KEYS.backupRetentionDays, SETTING_KEYS.backupApps],
        },
      },
      select: { key: true, value: true },
    });
    return toBackupSettings(rows);
  }

  async updateBackup(input: {
    backupEnabled?: unknown;
    backupRetentionDays?: unknown;
    backupApps?: unknown;
  }): Promise<BackupSettings> {
    if (input.backupEnabled !== undefined) {
      await this.upsert(SETTING_KEYS.backupEnabled, input.backupEnabled ? 'true' : 'false');
    }
    if (input.backupApps !== undefined) {
      await this.upsert(SETTING_KEYS.backupApps, input.backupApps ? 'true' : 'false');
    }
    if (input.backupRetentionDays !== undefined) {
      const dias = validateBackupRetentionDays(input.backupRetentionDays);
      await this.upsert(SETTING_KEYS.backupRetentionDays, String(dias));
    }
    return this.getBackup();
  }

  private async upsert(key: string, value: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
