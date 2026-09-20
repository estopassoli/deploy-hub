import { Controller, Get, Put, Post, Body, UseGuards } from '@nestjs/common';
import { SystemService } from './system.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// Era uma interface, que o ValidationPipe ignora por completo; veja system.dto.ts.
import {
  UpdateEmailSettingsDto,
  UpdateGeneralSettingsDto,
  UpdateNotificationSettingsDto,
} from './system.dto';
import { NotificationService } from '../notifications/notification.service';
import { SettingsService } from './settings.service';

@Controller('system')
@UseGuards(JwtAuthGuard)
export class SystemController {
  constructor(
    private systemService: SystemService,
    private settingsService: SettingsService,
    private notifications: NotificationService,
  ) {}

  @Get('stats')
  async getStats() {
    return this.systemService.getStats();
  }

  @Get('health')
  async health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('settings')
  async getSettings() {
    return this.systemService.getSettings();
  }

  @Put('settings/email')
  async updateEmailSettings(@Body() dto: UpdateEmailSettingsDto) {
    return this.systemService.updateEmailSettings(dto);
  }

  /** Retenção de releases/logs e liga-desliga da limpeza automática. */
  @Get('settings/general')
  async getGeneralSettings() {
    return this.settingsService.getGeneral();
  }

  @Put('settings/general')
  async updateGeneralSettings(@Body() dto: UpdateGeneralSettingsDto) {
    return this.settingsService.updateGeneral(dto);
  }

  /** Canais e eventos de notificação. Credenciais não são devolvidas. */
  @Get('settings/notifications')
  async getNotificationSettings() {
    return this.systemService.getNotificationSettings();
  }

  @Put('settings/notifications')
  async updateNotificationSettings(@Body() dto: UpdateNotificationSettingsDto) {
    return this.systemService.updateNotificationSettings(dto as Record<string, unknown>);
  }

  /**
   * Manda uma notificação de teste para todos os canais configurados.
   *
   * Ignora os toggles de evento de propósito: o objetivo é confirmar que a credencial
   * funciona, não esperar um deploy falhar para descobrir que o webhook estava errado.
   */
  @Post('settings/notifications/test')
  async testNotifications() {
    const results = await this.notifications.sendTest({
      event: 'deploy-success',
      subject: 'teste do DeployHub',
      detail: 'Se você está lendo isto, o canal está configurado corretamente.',
    });

    return {
      results,
      message: results.length === 0 ? 'Nenhum canal configurado' : undefined,
    };
  }

  /**
   * Apaga o histórico de logs do sistema.
   *
   * O botão existia na Danger Zone sem fazer nada. A tabela SystemLog cresce com cada
   * deploy, webhook e queda detectada; a limpeza diária só remove o que passou da
   * retenção, então uma limpeza sob demanda tem uso real.
   */
  @Post('logs/clear')
  async clearLogs() {
    return this.systemService.clearSystemLogs();
  }
}
