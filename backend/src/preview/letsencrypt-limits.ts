/**
 * Controle da cota de emissão do Let's Encrypt.
 *
 * ## O problema que isto evita
 *
 * O `certbot --nginx` que o painel usa faz validação HTTP-01, que emite **um
 * certificado por domínio** — não existe curinga por esse caminho. Com preview por
 * branch, cada branch nova consome uma emissão.
 *
 * O Let's Encrypt limita a **50 certificados por domínio registrado por semana**
 * (janela deslizante de 7 dias). Estourar não afeta só o preview: fica-se uma semana
 * sem conseguir emitir certificado para **nada** naquele domínio, incluindo os apps de
 * produção. Por isso a contagem é feita localmente e o deploy avisa antes de chegar lá.
 *
 * ## Duas regras do Let's Encrypt que mudam a contagem
 *
 * 1. **Domínio registrado, não hostname.** O limite é por eTLD+1: `a.exemplo.com` e
 *    `b.preview.exemplo.com` dividem a mesma cota de `exemplo.com`.
 * 2. **Renovação não conta.** Reemitir para um conjunto de nomes que já tem certificado
 *    é renovação e fica fora do limite de 50 (sujeita a outro limite, o de 5
 *    certificados duplicados por semana). Só a **primeira** emissão de um domínio novo
 *    consome cota — sem essa distinção, um servidor com renovações frequentes pareceria
 *    estourado sem estar.
 *
 * Módulo puro, testável pelo `node --test`.
 */

/** Limite do Let's Encrypt: certificados por domínio registrado, em 7 dias. */
export const WEEKLY_CERT_LIMIT = 50;

/** A partir daqui o deploy começa a avisar, antes de o limite ser atingido. */
export const WARN_THRESHOLD = 40;

export const WINDOW_DAYS = 7;

/**
 * Sufixos de duas partes em que o domínio registrado tem três rótulos.
 *
 * A lista pública de sufixos tem milhares de entradas e não vale trazer uma dependência
 * inteira só para isto; esta cobre os casos que aparecem na prática em hospedagem
 * brasileira e nos genéricos mais comuns. Um sufixo fora da lista é tratado como
 * eTLD+1 de dois rótulos, que é o caso da grande maioria dos domínios — e o erro,
 * quando acontece, é contar de forma mais conservadora (cota menor), nunca mais frouxa.
 */
const TWO_LEVEL_SUFFIXES = new Set([
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'app.br', 'dev.br', 'eco.br',
  'co.uk', 'org.uk', 'me.uk', 'gov.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'or.jp', 'ne.jp',
  'com.ar', 'com.mx', 'com.co', 'com.pt', 'com.es',
  'co.nz', 'co.za', 'co.in', 'com.tr',
]);

/**
 * Domínio registrado (eTLD+1) de um hostname.
 *
 * `feat-login.meu-app.exemplo.com.br` → `exemplo.com.br`
 * `api.exemplo.com` → `exemplo.com`
 */
export function registeredDomain(hostname: string): string {
  const limpo = (hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!limpo) return '';

  const partes = limpo.split('.');
  if (partes.length <= 2) return limpo;

  const doisUltimos = partes.slice(-2).join('.');
  if (TWO_LEVEL_SUFFIXES.has(doisUltimos) && partes.length >= 3) {
    return partes.slice(-3).join('.');
  }

  return doisUltimos;
}

export interface CertIssuance {
  domain: string;
  issuedAt: Date;
}

/** Emissões dentro da janela de 7 dias para o domínio registrado de `hostname`. */
export function countInWindow(
  issuances: CertIssuance[],
  hostname: string,
  now: Date = new Date(),
): number {
  const raiz = registeredDomain(hostname);
  if (!raiz) return 0;

  const corte = now.getTime() - WINDOW_DAYS * 86_400_000;

  return issuances.filter(
    (issuance) =>
      issuance.issuedAt.getTime() >= corte && registeredDomain(issuance.domain) === raiz,
  ).length;
}

export type QuotaLevel = 'ok' | 'warning' | 'exhausted';

export interface QuotaStatus {
  level: QuotaLevel;
  /** Emissões já usadas na janela. */
  used: number;
  /** Quantas ainda cabem. Zero quando esgotado. */
  remaining: number;
  registeredDomain: string;
  /** Quando a emissão mais antiga da janela sai, liberando uma vaga. */
  resetsAt: Date | null;
}

export function quotaStatus(
  issuances: CertIssuance[],
  hostname: string,
  now: Date = new Date(),
): QuotaStatus {
  const raiz = registeredDomain(hostname);
  const corte = now.getTime() - WINDOW_DAYS * 86_400_000;

  const naJanela = issuances
    .filter(
      (issuance) =>
        issuance.issuedAt.getTime() >= corte && registeredDomain(issuance.domain) === raiz,
    )
    .sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());

  const used = naJanela.length;
  const remaining = Math.max(0, WEEKLY_CERT_LIMIT - used);

  // A vaga mais próxima abre quando a emissão mais antiga completa 7 dias.
  const resetsAt = naJanela.length
    ? new Date(naJanela[0].issuedAt.getTime() + WINDOW_DAYS * 86_400_000)
    : null;

  let level: QuotaLevel = 'ok';
  if (used >= WEEKLY_CERT_LIMIT) level = 'exhausted';
  else if (used >= WARN_THRESHOLD) level = 'warning';

  return { level, used, remaining, registeredDomain: raiz, resetsAt };
}

/**
 * Uma emissão para este domínio consome cota?
 *
 * Renovação (já existe certificado para o domínio) não conta no limite de 50.
 */
export function consumesQuota(hasExistingCertificate: boolean): boolean {
  return !hasExistingCertificate;
}

/** Mensagem para o log do deploy e para a notificação. */
export function describeQuota(status: QuotaStatus): string {
  const quando = status.resetsAt
    ? ` A próxima vaga abre em ${status.resetsAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
    : '';

  switch (status.level) {
    case 'exhausted':
      return (
        `Cota do Let's Encrypt esgotada para ${status.registeredDomain}: ` +
        `${status.used}/${WEEKLY_CERT_LIMIT} certificados emitidos nos últimos ${WINDOW_DAYS} dias. ` +
        `Nenhum certificado novo será emitido — nem para preview, nem para produção.${quando}`
      );
    case 'warning':
      return (
        `Cota do Let's Encrypt em ${status.used}/${WEEKLY_CERT_LIMIT} para ${status.registeredDomain} ` +
        `(restam ${status.remaining} nos próximos ${WINDOW_DAYS} dias).${quando}`
      );
    default:
      return `Cota do Let's Encrypt: ${status.used}/${WEEKLY_CERT_LIMIT} para ${status.registeredDomain}.`;
  }
}
