import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get(':appId')
  async getAppMetrics(
    @Param('appId') appId: string,
    @Query('hours') hours?: string,
  ) {
    const hoursNum = parseInt(hours || '1', 10);
    return this.metricsService.getAppMetrics(appId, Math.min(hoursNum, 24));
  }
}
