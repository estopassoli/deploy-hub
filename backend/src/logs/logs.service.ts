import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';

const execAsync = promisify(exec);

@Injectable()
export class LogsService {
    constructor(private prisma: PrismaService) { }

    async getSystemLogs(options: { level?: string; appId?: string; limit?: number }) {
        const where: any = {};
        if (options.level) where.level = options.level;
        if (options.appId) where.appId = options.appId;

        return this.prisma.systemLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: options.limit || 100,
        });
    }

    async createLog(data: { level: string; message: string; source?: string; appId?: string }) {
        return this.prisma.systemLog.create({ data });
    }

    async getAppLogs(appId: string, lines: number = 100) {
        const app = await this.prisma.app.findUnique({ where: { id: appId } });
        if (!app) return [];

        try {
            const { stdout } = await execAsync(`pm2 logs ${app.name} --lines ${lines} --nostream 2>&1 || true`);
            return this.parseLogOutput(stdout, app.name);
        } catch (error) {
            return [];
        }
    }

    async getPM2Logs(appName: string, lines: number = 100) {
        try {
            const { stdout } = await execAsync(`pm2 logs ${appName} --lines ${lines} --nostream 2>&1 || true`);
            return this.parseLogOutput(stdout, appName);
        } catch (error) {
            return [];
        }
    }

    private parseLogOutput(output: string, appName: string): any[] {
        const lines = output.split('\n').filter(line => line.trim());
        return lines.map((line, index) => {
            let level = 'info';
            if (line.toLowerCase().includes('error')) level = 'error';
            else if (line.toLowerCase().includes('warn')) level = 'warn';
            else if (line.toLowerCase().includes('debug')) level = 'debug';

            return {
                id: `${Date.now()}-${index}`,
                timestamp: new Date().toISOString(),
                level,
                app: appName,
                message: line,
            };
        });
    }
}