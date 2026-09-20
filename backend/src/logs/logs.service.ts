import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runCapture } from '../common/run';
import { appLogs } from '../deploy/docker';

/** `pm2 logs` sem shell. O nome do app vem do banco e não é reinterpretado. */
function pm2LogsArgs(appName: string, lines: number): string[] {
    return ['logs', appName, '--lines', String(lines), '--nostream'];
}

@Injectable()
export class LogsService {
    constructor(private prisma: PrismaService) { }

    async getSystemLogs(options: { level?: string; appId?: string; limit?: number }) {
        const where: any = {};
        if (options.level) where.level = options.level;
        if (options.appId) where.appId = options.appId;

        const logs = await this.prisma.systemLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: options.limit || 100,
        });

        // A coluna chama `createdAt`, mas todo o resto do sistema — o stream de logs do
        // WebSocket, o tipo LogEntry do frontend, o painel de atividade recente — usa
        // `timestamp`. O "Invalid Date" que aparecia no card Recent Activity era
        // exatamente isso: o componente lia `log.timestamp`, que não existia na resposta.
        // Normalizado aqui, na API, para haver um formato só.
        return logs.map((log) => ({ ...log, timestamp: log.createdAt.toISOString() }));
    }

    async createLog(data: { level: string; message: string; source?: string; appId?: string }) {
        return this.prisma.systemLog.create({ data });
    }

    async getAppLogs(appId: string, lines: number = 100) {
        const app = await this.prisma.app.findUnique({ where: { id: appId } });
        if (!app) return [];

        try {
            // A containerised app has no PM2 entry at all, so asking pm2 would return an
            // empty panel rather than the app's output.
            // runCapture substitui o `2>&1 || true`: o que interessa aqui é o texto
            // produzido, não o código de saída do pm2.
            const stdout = app.activeRuntime === 'docker'
                ? await appLogs(app.name, lines)
                : await runCapture('pm2', pm2LogsArgs(app.name, lines));
            return this.parseLogOutput(stdout, app.name);
        } catch (error) {
            return [];
        }
    }

    async getPM2Logs(appName: string, lines: number = 100) {
        try {
            const stdout = await runCapture('pm2', pm2LogsArgs(appName, lines));
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