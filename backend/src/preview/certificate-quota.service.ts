import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import {
  QuotaStatus,
  WEEKLY_CERT_LIMIT,
  consumesQuota,
  describeQuota,
  quotaStatus,
} from './letsencrypt-limits';

/**
 * Cota de emissão de certificados do Let's Encrypt.
 *
 * ## Por que existe
 *
 * O `certbot --nginx` do painel faz validação HTTP-01, que emite um certificado por
 * domínio — não existe curinga por esse caminho. Com preview por branch, cada branch
 * nova consome uma emissão, e o Let's Encrypt limita a 50 por domínio registrado a
 * cada 7 dias.
 *
 * O que torna isso perigoso não é o preview falhar: é que, ao estourar, **o domínio
 * inteiro fica uma semana sem conseguir emitir certificado**, incluindo os apps de
 * produção. Não há API para consultar a cota, então ela é contada localmente a cada
 * emissão bem-sucedida.
 *
 * ## Onde o aviso aparece
 *
 * - No log do deploy, antes de tentar emitir;
 * - como notificação (Slack/Discord/Telegram/email) quando a cota se esgota ou entra
 *   na faixa de aviso — uma vez por dia, para não virar spam;
 * - na API, para o painel mostrar um aviso permanente enquanto a cota estiver apertada.
 */
@Injectable()
export class CertificateQuotaService {
  private readonly logger = new Logger('CertificateQuota');

  /** Última notificação por domínio registrado, para não repetir o alerta a cada deploy. */
  private readonly lastNotified = new Map<string, number>();
  private static readonly NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /** Situação da cota para o domínio registrado de `hostname`. */
  async status(hostname: string): Promise<QuotaStatus> {
    const desde = new Date(Date.now() - 8 * 86_400_000);

    const emissoes = await this.prisma.certificateIssuance.findMany({
      where: { issuedAt: { gte: desde }, countsToQuota: true },
      select: { domain: true, issuedAt: true },
    });

    return quotaStatus(emissoes, hostname);
  }

  /**
   * Pode emitir um certificado para este domínio agora?
   *
   * Uma renovação (já existe certificado no disco) passa sempre: ela não consome a cota
   * de 50 e bloqueá-la faria o painel deixar certificados vencerem por engano — o
   * oposto do que se quer.
   */
  async canIssue(hostname: string): Promise<{
    allowed: boolean;
    status: QuotaStatus;
    isRenewal: boolean;
    reason?: string;
  }> {
    const isRenewal = this.hasExistingCertificate(hostname);
    const status = await this.status(hostname);

    if (!consumesQuota(isRenewal)) {
      return { allowed: true, status, isRenewal: true };
    }

    if (status.level === 'exhausted') {
      return { allowed: false, status, isRenewal: false, reason: describeQuota(status) };
    }

    return { allowed: true, status, isRenewal: false };
  }

  /** Registra uma emissão bem-sucedida. */
  async record(hostname: string, options: { appId?: string | null; isRenewal: boolean }): Promise<void> {
    try {
      await this.prisma.certificateIssuance.create({
        data: {
          domain: hostname,
          appId: options.appId ?? null,
          countsToQuota: consumesQuota(options.isRenewal),
        },
      });
    } catch (error: any) {
      // Não conseguir registrar a emissão não pode derrubar um deploy que já emitiu o
      // certificado — o efeito é só a contagem ficar otimista até a próxima.
      this.logger.warn(`Não foi possível registrar a emissão de ${hostname}: ${error.message}`);
    }
  }

  /**
   * Avisa sobre a cota, se for o caso.
   *
   * `log` recebe a mensagem para o stream do deploy; a notificação sai no máximo uma
   * vez por dia por domínio.
   */
  async warnIfNeeded(status: QuotaStatus, log: (message: string) => void): Promise<void> {
    if (status.level === 'ok') return;

    const mensagem = describeQuota(status);
    log(status.level === 'exhausted' ? `❌ ${mensagem}` : `⚠️ ${mensagem}`);

    const agora = Date.now();
    const ultima = this.lastNotified.get(status.registeredDomain) ?? 0;
    if (agora - ultima < CertificateQuotaService.NOTIFY_COOLDOWN_MS) return;

    this.lastNotified.set(status.registeredDomain, agora);

    await this.notifications
      .notify({
        event: 'ssl-expiring',
        subject: status.registeredDomain,
        detail: mensagem,
      })
      .catch(() => undefined);

    await this.prisma.systemLog
      .create({
        data: {
          level: status.level === 'exhausted' ? 'error' : 'warn',
          message: mensagem,
          source: 'letsencrypt',
        },
      })
      .catch(() => undefined);
  }

  /** Resumo por domínio registrado, para o painel mostrar. */
  async summary(): Promise<Array<QuotaStatus & { limit: number }>> {
    const desde = new Date(Date.now() - 8 * 86_400_000);

    const emissoes = await this.prisma.certificateIssuance.findMany({
      where: { issuedAt: { gte: desde }, countsToQuota: true },
      select: { domain: true, issuedAt: true },
    });

    const apps = await this.prisma.app.findMany({
      where: { domain: { not: null } },
      select: { domain: true },
    });

    // Um domínio registrado aparece no resumo se tem app OU emissão recente.
    const hostnames = new Set<string>([
      ...apps.map((app) => app.domain!),
      ...emissoes.map((emissao) => emissao.domain),
    ]);

    const porRaiz = new Map<string, QuotaStatus>();
    for (const hostname of hostnames) {
      const status = quotaStatus(emissoes, hostname);
      if (status.registeredDomain) porRaiz.set(status.registeredDomain, status);
    }

    return [...porRaiz.values()]
      .map((status) => ({ ...status, limit: WEEKLY_CERT_LIMIT }))
      .sort((a, b) => b.used - a.used);
  }

  /** Já existe certificado do Let's Encrypt para este domínio? */
  private hasExistingCertificate(hostname: string): boolean {
    try {
      return fs.existsSync(`/etc/letsencrypt/live/${hostname}/fullchain.pem`);
    } catch {
      return false;
    }
  }
}
