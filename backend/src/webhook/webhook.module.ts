import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { DeployModule } from '../deploy/deploy.module';
import { PreviewModule } from '../preview/preview.module';

@Module({
  imports: [DeployModule, PreviewModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
