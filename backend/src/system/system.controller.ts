import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { SystemService } from './system.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UpdateEmailSettingsDto {
  emailEnabled: boolean;
  emailRecipient?: string;
}

@Controller('system')
@UseGuards(JwtAuthGuard)
export class SystemController {
  constructor(private systemService: SystemService) {}

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
}
