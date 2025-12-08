import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LogsController } from './logs.controller';
import { LogsGateway } from './logs.gateway';
import { LogsService } from './logs.service';

@Module({
    imports: [PrismaModule],
    controllers: [LogsController],
    providers: [LogsService, LogsGateway],
    exports: [LogsService],
})
export class LogsModule { }