/**
 * Leitura centralizada das variáveis de ambiente sensíveis.
 *
 * Sem decorators e sem dependência do Nest, de propósito: assim o `node --test`
 * consegue importar este arquivo direto (veja o cabeçalho de `apps/apps.dto.ts`).
 *
 * Antes desta mudança, `JWT_SECRET` e `REGISTRATION_SECRET` tinham fallback literal no
 * código (`'deployhub-secret-key-change-in-production'` e `'deployhub-secret-2024'`).
 * Uma instalação sem `.env` subia com segredos públicos — qualquer pessoa podia forjar
 * um JWT válido e criar contas. Agora o backend recusa subir sem `JWT_SECRET`, e o
 * registro fica desabilitado enquanto `REGISTRATION_SECRET` não existir.
 */

export class MissingEnvVarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingEnvVarError';
  }
}

export interface EnvSource {
  [key: string]: string | undefined;
}

/**
 * Segredo de assinatura dos JWT. Obrigatório — sem ele o backend não sobe.
 *
 * O `setup.sh` gera este valor desde sempre (`openssl rand -hex 32`), então uma
 * instalação feita pelo instalador oficial já tem. Instalações antigas feitas à mão
 * precisam adicionar a variável antes de atualizar; o `update.sh` checa isso antes de
 * reiniciar o PM2, para que a falha apareça no terminal do update em vez de derrubar o
 * painel.
 */
export function requireJwtSecret(env: EnvSource = process.env): string {
  const secret = (env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new MissingEnvVarError(
      'JWT_SECRET não está definido em backend/.env.\n' +
        'O DeployHub não sobe sem ele — um segredo padrão permitiria a qualquer pessoa forjar um token de acesso.\n' +
        'Gere um com:  openssl rand -hex 32\n' +
        'e adicione a linha  JWT_SECRET=<valor>  em backend/.env.',
    );
  }
  return secret;
}

/**
 * Segredo exigido por `POST /auth/register`. Opcional: quando não existe, o registro
 * responde 403 em vez de aceitar um valor padrão conhecido publicamente.
 */
export function getRegistrationSecret(env: EnvSource = process.env): string | null {
  const secret = (env.REGISTRATION_SECRET || '').trim();
  return secret ? secret : null;
}

/**
 * Origens permitidas no CORS da API e dos WebSockets, lidas de `CORS_ORIGINS`
 * (separadas por vírgula).
 *
 * O fallback é `true` — que o Express e o Socket.IO tratam como "reflita a origem da
 * requisição", equivalente ao `origin: '*'` que estava no código. É deliberado: o
 * instalador atual não escreve `CORS_ORIGINS`, e restringir por padrão derrubaria o
 * painel de toda instalação existente no primeiro `update.sh`. A proteção que importa
 * de verdade é o JWT agora exigido no handshake do WebSocket; o CORS é defesa extra,
 * que quem configurar a variável passa a ter.
 */
export function parseCorsOrigins(raw: string | undefined): string[] | true {
  const origins = (raw || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : true;
}

/** True quando o CORS está aberto (nenhuma origem configurada). */
export function isPermissiveCors(origins: string[] | true): origins is true {
  return origins === true;
}
