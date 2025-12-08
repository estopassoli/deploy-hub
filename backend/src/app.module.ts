import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AppsModule } from './apps/apps.module';
import { DeployModule } from './deploy/deploy.module';
import { LogsModule } from './logs/logs.module';
import { WebhookModule } from './webhook/webhook.module';
import { SystemModule } from './system/system.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AppsModule,
    DeployModule,
    LogsModule,
    WebhookModule,
    SystemModule,
    MetricsModule,
  ],
})
export class AppModule {}
