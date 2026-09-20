import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

// Global porque o interceptor é registrado em main.ts e o TerminalGateway também grava.
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
