import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LogsService } from './logs.service';

@Controller('logs')
@UseGuards(JwtAuthGuard)
export class LogsController {
  constructor(private logsService: LogsService) {}

  @Get()
  async getSystemLogs(
    @Query('level') level?: string,
    @Query('appId') appId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.logsService.getSystemLogs({
      level,
      appId,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }

  @Get('app/:appId')
  async getAppLogs(
    @Param('appId') appId: string,
    @Query('lines') lines?: string,
  ) {
    return this.logsService.getAppLogs(appId, lines ? parseInt(lines, 10) : 100);
  }

  @Get('pm2/:appName')
  async getPM2Logs(
    @Param('appName') appName: string,
    @Query('lines') lines?: string,
  ) {
    return this.logsService.getPM2Logs(appName, lines ? parseInt(lines, 10) : 100);
  }
}