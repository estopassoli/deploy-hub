import { Module, forwardRef } from '@nestjs/common';
import { DeployController } from './deploy.controller';
import { DeployService } from './deploy.service';
import { DeployGateway } from './deploy.gateway';
import { AppsModule } from '../apps/apps.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [forwardRef(() => AppsModule), NotificationModule],
  controllers: [DeployController],
  providers: [DeployService, DeployGateway],
  exports: [DeployService, DeployGateway],
})
export class DeployModule {}
