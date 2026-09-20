import { BadRequestException, Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from '../system/settings.service';
import { CertificateQuotaService } from './certificate-quota.service';
import { PreviewService } from './preview.service';
import { WEEKLY_CERT_LIMIT } from './letsencrypt-limits';
import { parsePortRange } from './preview-naming';

@Controller('previews')
@UseGuards(JwtAuthGuard)
export class PreviewController {
  constructor(
    private previews: PreviewService,
    private settings: SettingsService,
    private certQuota: CertificateQuotaService,
  ) {}

  @Get()
  async list() {
    const [items, config] = await Promise.all([this.previews.list(), this.settings.getPreview()]);
    return { items, config, portRange: parsePortRange(process.env.PREVIEW_PORT_RANGE) };
  }

  @Get('settings')
  async getSettings() {
    return this.settings.getPreview();
  }

  @Put('settings')
  async updateSettings(
    @Body() dto: { previewEnabled?: boolean; previewBranchPattern?: string; previewTtlDays?: number },
  ) {
    try {
      return await this.settings.updatePreview(dto);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Situação da cota de certificados, por domínio registrado.
   *
   * O painel usa isto para mostrar o aviso antes de alguém ligar o preview e descobrir
   * na prática que o domínio inteiro ficou uma semana sem poder emitir certificado.
   */
  @Get('certificate-quota')
  async certificateQuota() {
    return { limit: WEEKLY_CERT_LIMIT, domains: await this.certQuota.summary() };
  }

  /** Remove um preview agora, sem esperar a branch ser apagada nem o TTL. */
  @Delete(':name')
  async destroy(@Param('name') name: string) {
    return this.previews.destroy(name);
  }
}
