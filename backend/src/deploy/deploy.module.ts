import { Module } from '@nestjs/common';
import { DeployController } from './deploy.controller';
import { DeployService } from './deploy.service';
import { DeployGateway } from './deploy.gateway';
import { AppsModule } from '../apps/apps.module';

@Module({
  imports: [AppsModule],
  controllers: [DeployController],
  providers: [DeployService, DeployGateway],
  exports: [DeployService, DeployGateway],
})
export class DeployModule {}
