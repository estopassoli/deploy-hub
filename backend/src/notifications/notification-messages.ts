/**
 * Eventos de notificação e como cada canal os representa.
 *
 * ## Contexto
 *
 * `SystemSettings.slackWebhook` existia desde a primeira migration, aparecia como
 * campo na tela de configurações... e nunca foi lido por nada. Não havia código que
 * enviasse coisa alguma para o Slack. A única notificação real era o email, que só
 * disparava em três situações e exigia uma `RESEND_API_KEY`.
 *
 * ## Por que os formatos são diferentes
 *
 * Os três serviços aceitam texto simples, mas cada um tem um formato próprio que rende
 * uma mensagem legível em vez de uma linha corrida:
 *
 *   - **Slack** usa Block Kit; o `text` continua indo junto como fallback para a
 *     notificação do celular, que não renderiza blocos.
 *   - **Discord** usa embeds, com uma cor por severidade — no meio de um canal cheio,
 *     a faixa colorida é o que diferencia "deploy ok" de "app caiu" antes de ler.
 *   - **Telegram** usa Markdown; caracteres especiais precisam de escape, senão a
 *     mensagem é recusada pela API com "can't parse entities" e a notificação some
 *     em silêncio.
 *
 * Módulo puro, testável pelo `node --test`.
 */

export type NotificationEvent =
  | 'deploy-failed'
  | 'deploy-success'
  | 'rollback'
  | 'app-down'
  | 'ssl-expiring';

export type Severity = 'success' | 'warning' | 'error';

export interface NotificationPayload {
  event: NotificationEvent;
  /** App, projeto ou domínio envolvido. */
  subject: string;
  /** Linha de detalhe: mensagem de erro, versão, dias restantes. */
  detail?: string;
  /** Link para a página do app no painel, quando aplicável. */
  url?: string;
}

interface EventMeta {
  emoji: string;
  title: (subject: string) => string;
  severity: Severity;
  /** Campo de `SystemSettings` que liga/desliga este evento. */
  settingKey:
    | 'notifyDeployFailed'
    | 'notifyDeploySuccess'
    | 'notifyRollback'
    | 'notifyAppDown'
    | 'notifySslExpiring';
}

export const EVENT_META: Record<NotificationEvent, EventMeta> = {
  'deploy-failed': {
    emoji: '❌',
    title: (subject) => `Deploy falhou: ${subject}`,
    severity: 'error',
    settingKey: 'notifyDeployFailed',
  },
  'deploy-success': {
    emoji: '✅',
    title: (subject) => `Deploy concluído: ${subject}`,
    severity: 'success',
    settingKey: 'notifyDeploySuccess',
  },
  rollback: {
    emoji: '↩️',
    title: (subject) => `Rollback automático: ${subject}`,
    severity: 'warning',
    settingKey: 'notifyRollback',
  },
  'app-down': {
    emoji: '🔴',
    title: (subject) => `Aplicação fora do ar: ${subject}`,
    severity: 'error',
    settingKey: 'notifyAppDown',
  },
  'ssl-expiring': {
    emoji: '🔐',
    title: (subject) => `Certificado SSL expirando: ${subject}`,
    severity: 'warning',
    settingKey: 'notifySslExpiring',
  },
};

/** Cores dos embeds do Discord, em decimal (é o formato que a API espera). */
const DISCORD_COLORS: Record<Severity, number> = {
  success: 0x22c55e,
  warning: 0xf59e0b,
  error: 0xef4444,
};

/** Texto simples — fallback e base das outras representações. */
export function plainText(payload: NotificationPayload): string {
  const meta = EVENT_META[payload.event];
  const linhas = [`${meta.emoji} ${meta.title(payload.subject)}`];
  if (payload.detail) linhas.push(payload.detail);
  if (payload.url) linhas.push(payload.url);
  return linhas.join('\n');
}

export function buildSlackPayload(payload: NotificationPayload): object {
  const meta = EVENT_META[payload.event];

  const blocks: object[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${meta.emoji} *${meta.title(payload.subject)}*` },
    },
  ];

  if (payload.detail) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `\`\`\`${truncate(payload.detail, 2500)}\`\`\`` },
    });
  }

  if (payload.url) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${payload.url}|Abrir no DeployHub>` }],
    });
  }

  // `text` vai junto de propósito: é o que aparece na notificação do celular, que
  // não renderiza blocks.
  return { text: plainText(payload), blocks };
}

export function buildDiscordPayload(payload: NotificationPayload): object {
  const meta = EVENT_META[payload.event];

  return {
    embeds: [
      {
        title: `${meta.emoji} ${meta.title(payload.subject)}`,
        description: payload.detail ? truncate(payload.detail, 4000) : undefined,
        color: DISCORD_COLORS[meta.severity],
        url: payload.url,
        footer: { text: 'DeployHub' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Escapa os caracteres reservados do MarkdownV2 do Telegram.
 *
 * Sem isso, um erro de deploy contendo `_`, `*`, `[` ou `-` — praticamente qualquer
 * stack trace — faz a API responder "can't parse entities" e a notificação some sem
 * deixar rastro.
 */
export function escapeTelegramMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (char) => `\\${char}`);
}

export function buildTelegramPayload(payload: NotificationPayload, chatId: string): object {
  const meta = EVENT_META[payload.event];

  const partes = [`${meta.emoji} *${escapeTelegramMarkdown(meta.title(payload.subject))}*`];
  if (payload.detail) partes.push(`\`\`\`\n${escapeTelegramMarkdown(truncate(payload.detail, 3000))}\n\`\`\``);
  if (payload.url) partes.push(escapeTelegramMarkdown(payload.url));

  return {
    chat_id: chatId,
    text: partes.join('\n'),
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
  };
}

/** Corta o texto preservando o FIM, que é onde está a causa de um erro. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `...${text.slice(-(max - 3))}`;
}

/** URL da API do Telegram para o token informado. */
export function telegramApiUrl(botToken: string): string {
  return `https://api.telegram.org/bot${botToken}/sendMessage`;
}
