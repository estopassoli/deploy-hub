import { Controller, Get, Put, Post, Body, UseGuards } from '@nestjs/common';
import { SystemService } from './system.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// Era uma interface, que o ValidationPipe ignora por completo; veja system.dto.ts.
import { UpdateEmailSettingsDto, UpdateGeneralSettingsDto } from './system.dto';
import { SettingsService } from './settings.service';

@Controller('system')
@UseGuards(JwtAuthGuard)
export class SystemController {
  constructor(
    private systemService: SystemService,
    private settingsService: SettingsService,
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
