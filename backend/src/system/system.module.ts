import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { CleanupService } from './cleanup.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService, CleanupService],
  exports: [SystemService],
})
export class SystemModule {}
