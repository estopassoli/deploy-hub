import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DeployModule } from '../deploy/deploy.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [PrismaModule, DeployModule, NotificationModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
