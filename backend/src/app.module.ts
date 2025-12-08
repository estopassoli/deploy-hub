import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AppsModule } from './apps/apps.module';
import { DeployModule } from './deploy/deploy.module';
import { WebhookModule } from './webhook/webhook.module';
import { SystemModule } from './system/system.module';
import { MetricsModule } from './metrics/metrics.module';
import { EmailModule } from './email/email.module';
import { TerminalModule } from './terminal/terminal.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AppsModule,
    DeployModule,
    WebhookModule,
    SystemModule,
    MetricsModule,
    EmailModule,
    TerminalModule,
  ],
})
export class AppModule {}
