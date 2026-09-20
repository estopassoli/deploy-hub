import { createHmac } from 'crypto';
import { safeCompareSecret } from '../auth/auth-tokens.ts';

/**
 * Autenticação dos webhooks do GitHub.
 *
 * ## Os três problemas que este módulo resolve
 *
 * O `webhook.service.ts` validava a assinatura HMAC, mas de três formas frágeis:
 *
 * 1. **Logava a assinatura esperada.** `console.log('[Webhook] Expected signature: ...')`
 *    imprimia, a cada requisição, o HMAC correto para aquele corpo. Quem tivesse acesso
 *    aos logs do painel — que qualquer usuário autenticado lê em `/logs`, e que o PM2
 *    grava em disco — conseguia reenviar aquele payload com assinatura válida. Também
 *    logava o corpo inteiro (`Body to hash`), despejando o payload do GitHub no log.
 *
 * 2. **Comparava com `!==`.** Comparação de string em JavaScript sai no primeiro byte
 *    diferente, então o tempo de resposta vaza quantos bytes iniciais estão corretos.
 *    Com a assinatura em hex, isso é forjável byte a byte.
 *
 * 3. **App sem segredo passava direto.** O `else` registrava "skipping signature
 *    verification" e seguia para o deploy: quem soubesse o nome do app disparava
 *    deploys sem credencial nenhuma.
 *
 * ## Sobre o terceiro: por que rejeitar, e qual é o escape
 *
 * Todo caminho de criação de app hoje gera um `webhookSecret`, então só linhas antigas
 * podem estar sem. Rejeitar é o comportamento correto, mas quebraria o webhook desses
 * apps sem aviso — por isso existe `WEBHOOK_ALLOW_UNSIGNED=true`, que restaura o
 * comportamento antigo enquanto o operador configura os segredos. O fallback grita: loga
 * um aviso e registra no log do sistema a cada uso, para não virar permanente por
 * esquecimento.
 *
 * Módulo puro, testável pelo `node --test`.
 */

export const SIGNATURE_HEADER = 'x-hub-signature-256';

/** Assinatura que o GitHub deveria mandar para este corpo. */
export function computeSignature(secret: string, body: string | Buffer): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Confere a assinatura recebida em tempo constante.
 *
 * `safeCompareSecret` passa os dois lados por SHA-256 antes do `timingSafeEqual`, o que
 * resolve de uma vez o tempo de comparação e a diferença de comprimento (o
 * `timingSafeEqual` puro lança quando os buffers têm tamanhos diferentes, e tratar essa
 * exceção reintroduziria justamente o vazamento).
 */
export function verifySignature(
  secret: string,
  receivedHeader: unknown,
  body: string | Buffer,
): boolean {
  if (typeof receivedHeader !== 'string' || !receivedHeader) return false;
  if (!secret) return false;
  return safeCompareSecret(receivedHeader, computeSignature(secret, body));
}

export type WebhookAuthDecision =
  | { action: 'verify' }
  | { action: 'allow-unsigned'; warning: string }
  | { action: 'reject'; reason: string };

/**
 * O que fazer com um webhook, dado o que o app tem configurado.
 *
 * Separado do serviço para poder ser testado: é a regra que decide se um deploy pode ser
 * disparado sem credencial.
 */
export function decideWebhookAuth(options: {
  hasSecret: boolean;
  allowUnsigned: boolean;
  appName: string;
}): WebhookAuthDecision {
  if (options.hasSecret) return { action: 'verify' };

  if (options.allowUnsigned) {
    return {
      action: 'allow-unsigned',
      warning:
        `Webhook de ${options.appName} aceito SEM verificação de assinatura porque ` +
        'WEBHOOK_ALLOW_UNSIGNED está ligado. Qualquer um que saiba o nome do app pode ' +
        'disparar deploys. Gere um segredo para este app e remova a variável.',
    };
  }

  return {
    action: 'reject',
    reason:
      `O app ${options.appName} não tem segredo de webhook configurado, então a ` +
      'requisição não pode ser autenticada. Gere um segredo na página do app e ' +
      'configure-o no webhook do GitHub.',
  };
}

/** `WEBHOOK_ALLOW_UNSIGNED`: só um "true"/"1"/"yes" explícito liga o fallback. */
export function parseAllowUnsigned(raw: string | null | undefined): boolean {
  const valor = (raw || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(valor);
}

/**
 * Descrição da assinatura recebida, para o log.
 *
 * Nunca o valor: um HMAC no log é material de replay. Só se veio e em que formato, que é
 * o suficiente para diagnosticar "o GitHub não está mandando o header" versus "o segredo
 * está errado".
 */
export function describeSignatureHeader(header: unknown): string {
  if (typeof header !== 'string' || !header) return 'ausente';
  if (!header.startsWith('sha256=')) return 'formato inesperado';
  return 'presente';
}
