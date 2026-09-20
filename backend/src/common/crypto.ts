/**
 * Criptografia das variáveis de ambiente guardadas no banco.
 *
 * ## O que isto protege
 *
 * `App.envVars` e `Project.envVars` guardam o `.env` inteiro de cada aplicação —
 * `DATABASE_URL` com senha, chaves de API, `JWT_SECRET` dos apps gerenciados. Tudo isso
 * ficava em texto puro num arquivo SQLite. Quem lesse `backend/prisma/deployhub.db` (um
 * backup mal guardado, um `scp` do arquivo, um `prisma studio` aberto) levava os
 * segredos de todos os 21 apps de uma vez.
 *
 * AES-256-GCM: confidencialidade **e** autenticação. O GCM detecta adulteração do
 * ciphertext — sem isso, alguém com escrita no arquivo poderia alterar bits do
 * `DATABASE_URL` de um app sem que nada percebesse.
 *
 * ## Formato
 *
 *     enc:v1:<iv em base64>:<auth tag em base64>:<ciphertext em base64>
 *
 * O prefixo com versão serve para dois propósitos: distinguir um valor criptografado de
 * um valor legado em texto puro (migração transparente — `isEncrypted` devolve false e
 * o valor é usado como está, sendo recriptografado no próximo save), e permitir trocar
 * de algoritmo no futuro sem ambiguidade.
 *
 * Módulo puro, sem Nest e sem decorator, para ser testável pelo `node --test`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export const ENCRYPTED_PREFIX = 'enc:v1:';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96 bits, o tamanho recomendado para GCM
const TAG_BYTES = 16;

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionKeyError';
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * Interpreta `ENV_ENCRYPTION_KEY`. Aceita 64 caracteres hex ou 32 bytes em base64 —
 * as duas saídas que `openssl rand` produz.
 *
 * Devolve `null` quando a variável não existe (criptografia desligada); lança quando
 * ela existe mas está malformada, porque aí é erro de configuração e seguir em frente
 * gravaria segredo em texto puro achando que estava protegido.
 */
export function parseEncryptionKey(raw: string | undefined | null): Buffer | null {
  const value = (raw || '').trim();
  if (!value) return null;

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }

  const fromBase64 = Buffer.from(value, 'base64');
  if (fromBase64.length === KEY_BYTES) {
    return fromBase64;
  }

  throw new EncryptionKeyError(
    'ENV_ENCRYPTION_KEY inválida: esperado 64 caracteres hex ou 32 bytes em base64.\n' +
      'Gere uma com:  openssl rand -hex 32',
  );
}

/** True quando o valor já está no formato criptografado deste módulo. */
export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/** Criptografa um texto. Um valor já criptografado é devolvido intacto. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  if (isEncrypted(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    ENCRYPTED_PREFIX +
    [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
  );
}

/**
 * Decriptografa um valor.
 *
 * Um valor **sem** o prefixo é considerado legado em texto puro e devolvido como está:
 * é isso que torna a migração transparente para as linhas que já existem no banco.
 *
 * Um valor **com** o prefixo que não consiga ser decriptografado **lança**. É
 * deliberado: devolver string vazia faria o deploy subir o app sem nenhuma variável de
 * ambiente — um app de produção bootando sem DATABASE_URL, em silêncio. É muito melhor
 * o deploy falhar dizendo que a chave está errada.
 */
export function decryptSecret(value: string, key: Buffer): string {
  if (!isEncrypted(value)) return value;

  const parts = value.slice(ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new DecryptionError('Valor criptografado malformado (esperado iv:tag:ciphertext)');
  }

  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new DecryptionError('Valor criptografado malformado (iv ou tag com tamanho errado)');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new DecryptionError(
      'Não foi possível decriptografar uma variável de ambiente guardada no banco.\n' +
        'Quase sempre isso significa que ENV_ENCRYPTION_KEY em backend/.env foi trocada ou perdida.\n' +
        'Restaure a chave original — sem ela os valores não são recuperáveis.',
    );
  }
}
