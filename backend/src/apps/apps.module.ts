import { Module, forwardRef } from '@nestjs/common';
import { DeployModule } from '../deploy/deploy.module';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';

// AppsController expõe POST /apps/:id/apply-env, que é executado pelo DeployService;
// o DeployModule, por sua vez, já importava o AppsModule. O forwardRef é o jeito do
// Nest de resolver esse ciclo — o caminho da API foi mantido como está especificado.
@Module({
  imports: [forwardRef(() => DeployModule)],
  controllers: [AppsController],
  providers: [AppsService],
  exports: [AppsService],
})
export class AppsModule {}
