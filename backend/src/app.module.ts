import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppsModule } from './apps/apps.module';
import { AuthModule } from './auth/auth.module';
import { DeployModule } from './deploy/deploy.module';
import { EmailModule } from './email/email.module';
import { LogsModule } from './logs/logs.module';
import { MetricsModule } from './metrics/metrics.module';
import { PrismaModule } from './prisma/prisma.module';
import { SystemModule } from './system/system.module';
import { TerminalModule } from './terminal/terminal.module';
import { WebhookModule } from './webhook/webhook.module';

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
    LogsModule,
  ],
})
export class AppModule { }
