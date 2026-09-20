import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  EVENT_META,
  NotificationEvent,
  NotificationPayload,
  buildDiscordPayload,
  buildSlackPayload,
  buildTelegramPayload,
  plainText,
  telegramApiUrl,
} from './notification-messages';

export interface ChannelResult {
  channel: 'slack' | 'discord' | 'telegram' | 'email';
  ok: boolean;
  error?: string;
  /** True quando o canal não está configurado — nem tentou. */
  skipped?: boolean;
}

/**
 * Envio de notificações para os canais configurados.
 *
 * ## Regras
 *
 * - **Nunca lança.** Notificação é efeito colateral: uma falha de rede no webhook do
 *   Slack não pode derrubar o deploy que a originou. Todo erro vira um resultado com
 *   `ok: false` e uma linha no log.
 * - **Cada canal é independente.** Discord fora do ar não impede o Telegram de receber.
 * - **Timeout curto.** Um webhook pendurado seguraria o pipeline; 10s é mais que
 *   suficiente para os três serviços.
 * - **Nada de segredo no log.** Webhook do Slack e token do Telegram são credenciais:
 *   o log registra o canal e o motivo, nunca a URL.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');
  private static readonly TIMEOUT_MS = 10_000;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  /**
   * Dispara um evento para todos os canais configurados que o tenham habilitado.
   *
   * Fire-and-forget do ponto de vista do chamador: devolve a promessa para quem quiser
   * aguardar (o endpoint de teste aguarda), mas o pipeline de deploy chama com
   * `.catch()` e segue.
   */
  async notify(payload: NotificationPayload): Promise<ChannelResult[]> {
    const settings = await this.prisma.systemSettings.findFirst();
    if (!settings) return [];

    const meta = EVENT_META[payload.event];
    if (!settings[meta.settingKey]) {
      return [];
    }

    return this.dispatch(settings, payload);
  }

  /** Envia para todos os canais, ignorando os toggles de evento (endpoint de teste). */
  async sendTest(payload: NotificationPayload): Promise<ChannelResult[]> {
    const settings = await this.prisma.systemSettings.findFirst();
    if (!settings) return [];
    return this.dispatch(settings, payload);
  }

  private async dispatch(settings: any, payload: NotificationPayload): Promise<ChannelResult[]> {
    const tarefas: Array<Promise<ChannelResult>> = [];

    if (settings.slackWebhook) {
      tarefas.push(this.postJson('slack', settings.slackWebhook, buildSlackPayload(payload)));
    }

    if (settings.discordWebhook) {
      tarefas.push(this.postJson('discord', settings.discordWebhook, buildDiscordPayload(payload)));
    }

    if (settings.telegramBotToken && settings.telegramChatId) {
      tarefas.push(
        this.postJson(
          'telegram',
          telegramApiUrl(settings.telegramBotToken),
          buildTelegramPayload(payload, settings.telegramChatId),
        ),
      );
    }

    if (settings.emailEnabled && settings.emailRecipient) {
      tarefas.push(this.sendEmail(payload, settings.emailRecipient));
    }

    const resultados = await Promise.all(tarefas);

    for (const resultado of resultados) {
      if (!resultado.ok) {
        this.logger.warn(`Notificação por ${resultado.channel} falhou: ${resultado.error}`);
      }
    }

    return resultados;
  }

  private async postJson(
    channel: ChannelResult['channel'],
    url: string,
    body: object,
  ): Promise<ChannelResult> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), NotificationService.TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          // O corpo da resposta ajuda muito (o Telegram diz exatamente o que recusou),
          // mas é cortado: não vale poluir o log com uma página de erro inteira.
          const texto = (await response.text().catch(() => '')).slice(0, 200);
          return { channel, ok: false, error: `HTTP ${response.status} ${texto}`.trim() };
        }

        return { channel, ok: true };
      } finally {
        clearTimeout(timer);
      }
    } catch (error: any) {
      const motivo = error?.name === 'AbortError' ? 'timeout' : (error?.message ?? String(error));
      return { channel, ok: false, error: motivo };
    }
  }

  private async sendEmail(payload: NotificationPayload, recipient: string): Promise<ChannelResult> {
    try {
      const meta = EVENT_META[payload.event];
      const enviado = await this.email.sendEmail({
        to: recipient,
        subject: `${meta.emoji} ${meta.title(payload.subject)}`,
        html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(plainText(payload))}</pre>`,
      });
      return enviado
        ? { channel: 'email', ok: true }
        : { channel: 'email', ok: false, error: 'RESEND_API_KEY não configurada ou envio recusado' };
    } catch (error: any) {
      return { channel: 'email', ok: false, error: error?.message ?? String(error) };
    }
  }

  /** Quais canais estão configurados — alimenta a UI sem expor as credenciais. */
  async configuredChannels(): Promise<Record<string, boolean>> {
    const settings = await this.prisma.systemSettings.findFirst();
    return {
      slack: Boolean(settings?.slackWebhook),
      discord: Boolean(settings?.discordWebhook),
      telegram: Boolean(settings?.telegramBotToken && settings?.telegramChatId),
      email: Boolean(settings?.emailEnabled && settings?.emailRecipient),
    };
  }
}

/** Escape mínimo para o corpo HTML do email. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
