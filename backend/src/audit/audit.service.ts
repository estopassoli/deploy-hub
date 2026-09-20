import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  success?: boolean;
}

/** Retenção da trilha. Bem maior que a dos logs operacionais: auditoria serve para olhar para trás. */
const RETENTION_DAYS = 365;

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService');

  constructor(private prisma: PrismaService) {}

  /**
   * Grava uma entrada.
   *
   * **Nunca lança.** Auditoria é observação: uma falha ao gravar o registro não pode
   * derrubar a operação que estava sendo auditada — seria trocar um problema de
   * rastreabilidade por uma indisponibilidade.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          userEmail: entry.userEmail ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          targetName: entry.targetName ?? null,
          metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
          ip: entry.ip ?? null,
          success: entry.success ?? true,
        },
      });
    } catch (error: any) {
      this.logger.warn(`Não foi possível gravar a auditoria de ${entry.action}: ${error.message}`);
    }
  }

  async list(options: {
    limit?: number;
    cursor?: string;
    action?: string;
    targetId?: string;
    userEmail?: string;
  }) {
    const take = Math.min(Math.max(options.limit ?? 50, 1), 200);

    const where: Record<string, unknown> = {};
    if (options.action) where.action = options.action;
    if (options.targetId) where.targetId = options.targetId;
    if (options.userEmail) where.userEmail = options.userEmail;

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const temMais = rows.length > take;
    const pagina = temMais ? rows.slice(0, take) : rows;

    return {
      entries: pagina.map((row) => ({
        ...row,
        metadata: row.metadata ? safeParse(row.metadata) : null,
      })),
      nextCursor: temMais ? pagina[pagina.length - 1].id : null,
    };
  }

  /** Ações distintas já registradas, para o filtro da UI. */
  async actions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    return rows.map((row) => row.action);
  }

  @Cron(CronExpression.EVERY_WEEK)
  async cleanup(): Promise<void> {
    const corte = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: corte } } });
    if (count > 0) this.logger.log(`${count} registros de auditoria com mais de ${RETENTION_DAYS} dias removidos`);
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
