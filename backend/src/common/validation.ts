/**
 * Padrões compartilhados pelos DTOs que alimentam comandos do sistema.
 *
 * Módulo puro, sem decorator e sem Nest, para ser importável pelos testes.
 */

/** Nome de app/projeto: vira processo PM2, container, vhost do nginx e diretório. */
export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Branch do git. Mesmo padrão que `UpdateProjectDto` já usava. */
export const BRANCH_PATTERN = /^[\w.\-/]+$/;

export const NAME_MAX_LENGTH = 100;
export const REPOSITORY_MAX_LENGTH = 2048;

/**
 * URL de repositório aceita.
 *
 * Só duas formas, porque são as duas que o `git clone` do painel realmente usa:
 *
 *   - SSH no formato scp:   `git@github.com:usuario/repo.git`
 *   - HTTPS:                `https://github.com/usuario/repo.git`
 *
 * O que fica de fora importa tanto quanto o que entra:
 *
 *   - `ssh://` com opções, `--upload-pack=...` e qualquer coisa começando com `-`, que o
 *     git interpretaria como flag em vez de URL (`--upload-pack` executa um comando
 *     arbitrário do outro lado).
 *   - `file://`, `/caminho/local` e `ext::sh -c ...`, que fazem o git clonar (ou
 *     executar) coisas do próprio servidor.
 *   - Qualquer valor com espaço, aspas, `;`, `|`, `$`, backtick ou quebra de linha.
 *
 * Mesmo com o `execFile` sem shell, isto continua valendo: o perigo do `--upload-pack`
 * não é o shell, é o próprio git.
 */
const SSH_SCP_REPOSITORY = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:[a-zA-Z0-9._~()/-]+$/;
const HTTPS_REPOSITORY = /^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?\/[a-zA-Z0-9._~()/-]+$/;

export function isSafeRepositoryUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const url = value.trim();
  if (!url || url.length > REPOSITORY_MAX_LENGTH) return false;

  // Um valor começando com '-' seria lido pelo git como flag, não como URL.
  if (url.startsWith('-')) return false;

  // Nada de espaço nem caractere de controle, em nenhuma das duas formas.
  // Checado por code point em vez de regex: um literal com \x00-\x1f dentro de uma
  // regex dispara o no-control-regex do eslint, e a intenção fica mais clara assim.
  if (/\s/.test(url)) return false;
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }

  return SSH_SCP_REPOSITORY.test(url) || HTTPS_REPOSITORY.test(url);
}

export const REPOSITORY_MESSAGE =
  'repository deve ser git@host:usuario/repo.git ou https://host/usuario/repo.git';

/**
 * Domínio usado em vhost do nginx e como argumento de `certbot -d`.
 *
 * Um hostname comum: rótulos alfanuméricos separados por ponto, sem esquema, sem porta
 * e sem caminho.
 */
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isSafeDomain(value: unknown): value is string {
  return typeof value === 'string' && DOMAIN_PATTERN.test(value);
}

export const DOMAIN_MESSAGE = 'domain deve ser um hostname válido (ex.: api.exemplo.com)';
