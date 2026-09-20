import { Module, forwardRef } from '@nestjs/common';
import { NotificationModule } from '../notifications/notification.module';
import { SystemModule } from '../system/system.module';
import { AppsModule } from '../apps/apps.module';
import { DeployModule } from '../deploy/deploy.module';
import { CertificateQuotaService } from './certificate-quota.service';
import { PreviewController } from './preview.controller';
import { PreviewService } from './preview.service';

/**
 * Preview por branch e cota de certificados.
 *
 * `CertificateQuotaService` é exportado à parte porque o `DeployService` depende dele
 * mesmo quando preview está desligado: a contagem de emissões vale para qualquer app,
 * e é ela que avisa antes de o domínio inteiro ficar sem poder emitir certificado.
 *
 * O `forwardRef` para `DeployModule`/`AppsModule` é inevitável: o webhook chama o
 * preview, o preview chama o deploy, e o deploy consulta a cota.
 */
@Module({
  imports: [
    NotificationModule,
    SystemModule,
    forwardRef(() => AppsModule),
    forwardRef(() => DeployModule),
  ],
  controllers: [PreviewController],
  providers: [PreviewService, CertificateQuotaService],
  exports: [PreviewService, CertificateQuotaService],
})
export class PreviewModule {}
