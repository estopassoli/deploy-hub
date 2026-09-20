import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UptimeService } from './uptime.service';

@Controller('uptime')
@UseGuards(JwtAuthGuard)
export class UptimeController {
  constructor(
    private uptime: UptimeService,
    private prisma: PrismaService,
  ) {}

  /** Disponibilidade e estado do certificado de um app. */
  @Get(':appId')
  async summary(@Param('appId') appId: string, @Query('hours') hours?: string) {
    const janela = Math.min(Math.max(parseInt(hours || '24', 10) || 24, 1), 720);
    const resumo = await this.uptime.summary(appId, janela);
    if (!resumo) throw new NotFoundException('App não encontrado');
    return resumo;
  }

  /** Checa agora, sem esperar o próximo ciclo do cron. */
  @Post(':appId/check')
  async checkNow(@Param('appId') appId: string) {
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { id: true, name: true, domain: true, lastUptimeStatus: true, sslExpiresAt: true },
    });
    if (!app) throw new NotFoundException('App não encontrado');
    if (!app.domain) throw new BadRequestException('Este app não tem domínio configurado');

    const [http, ssl] = await Promise.all([
      this.uptime.checkApp(app),
      this.uptime.checkCertificate(app),
    ]);

    return { ...http, sslExpiresAt: ssl };
  }
}
