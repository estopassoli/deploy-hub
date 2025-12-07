import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { DeployModule } from '../deploy/deploy.module';

@Module({
  imports: [DeployModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
