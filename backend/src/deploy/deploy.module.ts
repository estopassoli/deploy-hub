import { Module, forwardRef } from '@nestjs/common';
import { DeployController } from './deploy.controller';
import { DeployService } from './deploy.service';
import { DeployGateway } from './deploy.gateway';
import { AppsModule } from '../apps/apps.module';

@Module({
  imports: [forwardRef(() => AppsModule)],
  controllers: [DeployController],
  providers: [DeployService, DeployGateway],
  exports: [DeployService, DeployGateway],
})
export class DeployModule {}
