import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GeneralSettings,
  SETTING_KEYS,
  toGeneralSettings,
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

  private async upsert(key: string, value: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
