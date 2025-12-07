import { Controller, Get, UseGuards } from '@nestjs/common';
import { SystemService } from './system.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
}
