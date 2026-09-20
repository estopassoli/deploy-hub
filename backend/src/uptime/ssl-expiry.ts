/**
 * Validade do certificado TLS de um domínio.
 *
 * ## Por que ler do socket e não do arquivo
 *
 * O painel gera os certificados com certbot, e seria mais simples ler
 * `/etc/letsencrypt/live/<domínio>/cert.pem`. Mas isso responde à pergunta errada: o
 * que importa é **o certificado que o navegador do usuário recebe**, não o que está
 * guardado no disco. Os dois divergem em situações banais:
 *
 *   - a renovação rodou mas o nginx não recarregou, e ele segue servindo o antigo;
 *   - o vhost aponta para outro caminho de certificado;
 *   - o domínio está atrás de um proxy (Cloudflare) que apresenta o próprio
 *     certificado — e é esse que expira para o usuário.
 *
 * Abrir a conexão TLS mede o que de fato está no ar.
 *
 * Este módulo é puro; a conexão fica no service. Assim o cálculo de dias restantes e a
 * decisão de alertar ficam testáveis.
 */

/** Quantos dias antes do vencimento o alerta dispara. */
export const SSL_ALERT_DAYS = 14;

/**
 * Dias inteiros até o vencimento. Negativo quando já venceu.
 *
 * Arredonda para baixo: faltando 1,9 dia o número exibido é 1, que é o lado certo do
 * arredondamento para um alerta.
 */
export function daysUntil(expiresAt: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!expiresAt) return null;

  const fim = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(fim.getTime())) return null;

  return Math.floor((fim.getTime() - now.getTime()) / 86_400_000);
}

export type SslStatus = 'ok' | 'expiring' | 'expired' | 'unknown';

export function sslStatus(expiresAt: Date | string | null | undefined, now: Date = new Date()): SslStatus {
  const dias = daysUntil(expiresAt, now);
  if (dias === null) return 'unknown';
  if (dias < 0) return 'expired';
  if (dias <= SSL_ALERT_DAYS) return 'expiring';
  return 'ok';
}

/**
 * Deve alertar agora?
 *
 * Só quando o status mudou de `ok` para `expiring`/`expired`, ou quando ainda não havia
 * alerta nenhum. Sem essa checagem, o cron diário mandaria a mesma mensagem por catorze
 * dias seguidos e as pessoas passariam a ignorar o canal — que é justamente o canal que
 * precisa ser levado a sério quando algo cair.
 */
export function shouldAlertSsl(
  anterior: Date | string | null | undefined,
  atual: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const statusAtual = sslStatus(atual, now);
  if (statusAtual !== 'expiring' && statusAtual !== 'expired') return false;

  const statusAnterior = sslStatus(anterior, now);

  // Primeira leitura, ou o certificado acabou de entrar na faixa de alerta.
  if (statusAnterior === 'unknown') return true;
  if (statusAnterior === 'ok') return true;

  // Já estava expirando e virou expirado: vale um segundo aviso, é outra gravidade.
  return statusAnterior === 'expiring' && statusAtual === 'expired';
}

/** Mensagem do alerta. */
export function describeSslExpiry(domain: string, expiresAt: Date | string, now: Date = new Date()): string {
  const dias = daysUntil(expiresAt, now);
  if (dias === null) return `Não foi possível ler a validade do certificado de ${domain}.`;
  if (dias < 0) return `O certificado de ${domain} venceu há ${Math.abs(dias)} dia(s).`;
  if (dias === 0) return `O certificado de ${domain} vence hoje.`;
  return `O certificado de ${domain} vence em ${dias} dia(s).`;
}

/**
 * Uma resposta HTTP conta como "no ar"?
 *
 * Mesmo critério do health check do deploy: abaixo de 500 significa que a aplicação
 * está respondendo. Um 404 numa rota que não existe ou um 401 numa API protegida não
 * são queda.
 */
export function isUpStatus(statusCode: number): boolean {
  return Number.isFinite(statusCode) && statusCode > 0 && statusCode < 500;
}

/**
 * Deve alertar que o domínio caiu?
 *
 * Exige que o estado anterior fosse `up`, para não repetir o alerta a cada ciclo
 * enquanto o app continua fora do ar.
 */
export function shouldAlertDown(anterior: string | null | undefined, atual: 'up' | 'down'): boolean {
  return atual === 'down' && anterior === 'up';
}

/** Percentual de disponibilidade a partir de uma janela de checagens. */
export function uptimePercentage(checks: Array<{ status: string }>): number | null {
  if (checks.length === 0) return null;
  const up = checks.filter((check) => check.status === 'up').length;
  return Math.round((up / checks.length) * 1000) / 10;
}
