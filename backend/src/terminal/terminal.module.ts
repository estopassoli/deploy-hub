import { Module } from '@nestjs/common';
import { TerminalGateway } from './terminal.gateway';

// O AuditService vem do AuditModule, que é @Global.
@Module({
  providers: [TerminalGateway],
  exports: [TerminalGateway],
})
export class TerminalModule {}
