import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  async list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('action') action?: string,
    @Query('targetId') targetId?: string,
    @Query('userEmail') userEmail?: string,
  ) {
    return this.audit.list({
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
      action,
      targetId,
      userEmail,
    });
  }

  /** Ações distintas já registradas, para o filtro da UI. */
  @Get('actions')
  async actions() {
    return this.audit.actions();
  }
}
