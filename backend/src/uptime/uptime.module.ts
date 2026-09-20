import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notification.module';
import { UptimeController } from './uptime.controller';
import { UptimeService } from './uptime.service';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [UptimeController],
  providers: [UptimeService],
  exports: [UptimeService],
})
export class UptimeModule {}
