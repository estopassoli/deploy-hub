import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as tls from 'tls';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { isSafeDomain } from '../common/validation';
import {
  daysUntil,
  describeSslExpiry,
  isUpStatus,
  shouldAlertDown,
  shouldAlertSsl,
  sslStatus,
  uptimePercentage,
} from './ssl-expiry';

/** Retenção do histórico de checagens. Uma checagem a cada 5min por app é bastante linha. */
const RETENTION_DAYS = 30;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Monitor externo dos domínios e validade dos certificados.
 *
 * ## O que isto acrescenta ao que já existia
 *
 * O painel já sabia se o **processo** estava vivo (PM2/Docker) e, desde a Fase 3, se
 * ele respondia em `127.0.0.1` logo após o deploy. Nenhum dos dois responde à pergunta
 * que o usuário final faz: *o site abre?*
 *
 * Um app pode estar perfeitamente vivo no PM2 e mesmo assim inacessível — certificado
 * vencido, vhost apagado por um deploy de outro app com nome parecido, DNS mudado,
 * firewall. Este monitor faz a requisição pelo caminho completo (DNS → nginx → TLS →
 * app), que é o único jeito de perceber essas falhas.
 *
 * O certificado é lido do socket TLS, e não de `/etc/letsencrypt`: o que importa é o
 * que o navegador recebe. A renovação pode ter rodado sem o nginx recarregar, e o
 * arquivo no disco estaria certo enquanto o usuário vê um certificado vencido.
 */
@Injectable()
export class UptimeService {
  private readonly logger = new Logger('UptimeService');

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /**
   * Checagem HTTP de todos os domínios monitorados.
   *
   * A cada 5 minutos: frequente o suficiente para detectar uma queda antes de o
   * usuário reclamar, espaçado o suficiente para não virar tráfego relevante.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkAllDomains(): Promise<void> {
    const apps = await this.prisma.app.findMany({
      where: { domain: { not: null }, uptimeEnabled: true },
      select: { id: true, name: true, domain: true, lastUptimeStatus: true },
    });

    for (const app of apps) {
      if (!isSafeDomain(app.domain)) continue;
      await this.checkApp(app).catch((error) =>
        this.logger.warn(`Falha ao checar ${app.name}: ${error.message}`),
      );
    }
  }

  /** Checa um app e registra o resultado. Exposto para o botão "checar agora". */
  async checkApp(app: {
    id: string;
    name: string;
    domain: string | null;
    lastUptimeStatus?: string | null;
  }): Promise<{ status: 'up' | 'down'; statusCode?: number; responseMs?: number; error?: string }> {
    if (!app.domain) throw new Error('App sem domínio');

    const inicio = Date.now();
    let status: 'up' | 'down' = 'down';
    let statusCode: number | undefined;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`https://${app.domain}/`, {
          signal: controller.signal,
          redirect: 'manual',
          // HEAD seria mais leve, mas muitos apps não a implementam e devolvem 405 —
          // o que contaria como "no ar" por acaso, e falharia em app que responde 404
          // no HEAD e 200 no GET. GET mede o que o usuário realmente faz.
          method: 'GET',
          headers: { 'User-Agent': 'DeployHub-Monitor/1.0' },
        });
        statusCode = response.status;
        status = isUpStatus(response.status) ? 'up' : 'down';
        if (status === 'down') error = `HTTP ${response.status}`;
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      error = e?.name === 'AbortError' ? `timeout após ${REQUEST_TIMEOUT_MS / 1000}s` : (e?.message ?? String(e));
    }

    const responseMs = Date.now() - inicio;

    await this.prisma.uptimeCheck.create({
      data: { appId: app.id, status, statusCode, responseMs, error },
    });

    const anterior = app.lastUptimeStatus;
    await this.prisma.app.update({
      where: { id: app.id },
      data: { lastUptimeStatus: status, lastUptimeAt: new Date() },
    });

    if (shouldAlertDown(anterior, status)) {
      this.notifications
        .notify({
          event: 'app-down',
          subject: app.domain,
          detail: `O domínio parou de responder: ${error ?? 'sem detalhe'}`,
        })
        .catch(() => undefined);

      await this.prisma.systemLog.create({
        data: {
          level: 'error',
          message: `Domínio fora do ar: ${app.domain} (${error ?? 'sem detalhe'})`,
          source: 'uptime',
          appId: app.id,
        },
      });
    }

    return { status, statusCode, responseMs, error };
  }

  /**
   * Validade dos certificados, uma vez por dia.
   *
   * Diário basta: um certificado Let's Encrypt vale 90 dias e o alerta dispara com 14
   * de antecedência — há bastante margem.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async checkAllCertificates(): Promise<void> {
    const apps = await this.prisma.app.findMany({
      where: { domain: { not: null }, uptimeEnabled: true },
      select: { id: true, name: true, domain: true, sslExpiresAt: true },
    });

    for (const app of apps) {
      if (!isSafeDomain(app.domain)) continue;
      await this.checkCertificate(app).catch((error) =>
        this.logger.warn(`Falha ao ler o certificado de ${app.domain}: ${error.message}`),
      );
    }
  }

  async checkCertificate(app: {
    id: string;
    domain: string | null;
    sslExpiresAt?: Date | null;
  }): Promise<Date | null> {
    if (!app.domain) return null;

    const expiraEm = await readCertificateExpiry(app.domain);
    if (!expiraEm) return null;

    const anterior = app.sslExpiresAt ?? null;
    await this.prisma.app.update({ where: { id: app.id }, data: { sslExpiresAt: expiraEm } });

    if (shouldAlertSsl(anterior, expiraEm)) {
      this.notifications
        .notify({
          event: 'ssl-expiring',
          subject: app.domain,
          detail: describeSslExpiry(app.domain, expiraEm),
        })
        .catch(() => undefined);

      await this.prisma.systemLog.create({
        data: {
          level: 'warn',
          message: describeSslExpiry(app.domain, expiraEm),
          source: 'ssl',
          appId: app.id,
        },
      });
    }

    return expiraEm;
  }

  /** Resumo para a página do app: disponibilidade na janela e estado do certificado. */
  async summary(appId: string, hours = 24) {
    const desde = new Date(Date.now() - hours * 3_600_000);

    const [app, checks] = await Promise.all([
      this.prisma.app.findUnique({
        where: { id: appId },
        select: { domain: true, lastUptimeStatus: true, lastUptimeAt: true, sslExpiresAt: true, uptimeEnabled: true },
      }),
      this.prisma.uptimeCheck.findMany({
        where: { appId, checkedAt: { gte: desde } },
        orderBy: { checkedAt: 'asc' },
        select: { status: true, statusCode: true, responseMs: true, error: true, checkedAt: true },
      }),
    ]);

    if (!app) return null;

    const tempos = checks.filter((c) => c.responseMs !== null).map((c) => c.responseMs!);

    return {
      domain: app.domain,
      enabled: app.uptimeEnabled,
      currentStatus: app.lastUptimeStatus,
      lastCheckedAt: app.lastUptimeAt,
      uptimePercentage: uptimePercentage(checks),
      averageResponseMs: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
      checks,
      ssl: {
        expiresAt: app.sslExpiresAt,
        daysRemaining: daysUntil(app.sslExpiresAt),
        status: sslStatus(app.sslExpiresAt),
      },
    };
  }

  /** Limpa o histórico antigo de checagens. */
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async cleanupOldChecks(): Promise<void> {
    const corte = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.uptimeCheck.deleteMany({ where: { checkedAt: { lt: corte } } });
    if (count > 0) this.logger.log(`${count} checagens antigas removidas`);
  }
}

/**
 * Lê o `notAfter` do certificado que o domínio efetivamente apresenta.
 *
 * `rejectUnauthorized: false` de propósito: um certificado **vencido** ou auto-assinado
 * faria a conexão ser recusada antes de podermos ler a data — e é exatamente esse o
 * caso que mais interessa detectar. Aqui não há troca de dados, só a leitura do
 * certificado apresentado.
 */
function readCertificateExpiry(domain: string): Promise<Date | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: domain, port: 443, servername: domain, rejectUnauthorized: false, timeout: REQUEST_TIMEOUT_MS },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !cert.valid_to) {
          resolve(null);
          return;
        }

        const data = new Date(cert.valid_to);
        resolve(Number.isNaN(data.getTime()) ? null : data);
      },
    );

    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}
