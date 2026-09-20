import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { CleanupService } from './cleanup.service';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService, CleanupService, SettingsService],
  exports: [SystemService, SettingsService],
})
export class SystemModule {}
