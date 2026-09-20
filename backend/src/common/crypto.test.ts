import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DecryptionError,
  ENCRYPTED_PREFIX,
  EncryptionKeyError,
  decryptSecret,
  encryptSecret,
  isEncrypted,
  parseEncryptionKey,
} from './crypto.ts';

const KEY = randomBytes(32);
const ENV = 'DATABASE_URL=postgres://user:senha@host/db\nJWT_SECRET=abc\nNODE_ENV=production';

// --- parseEncryptionKey -------------------------------------------------------

test('parseEncryptionKey aceita hex de 64 caracteres', () => {
  const hex = KEY.toString('hex');
  assert.deepEqual(parseEncryptionKey(hex), KEY);
  assert.deepEqual(parseEncryptionKey(`  ${hex}  `), KEY);
});

test('parseEncryptionKey aceita base64 de 32 bytes', () => {
  assert.deepEqual(parseEncryptionKey(KEY.toString('base64')), KEY);
});

test('parseEncryptionKey devolve null quando a variável não existe', () => {
  // Criptografia desligada — instalações que ainda não geraram a chave continuam
  // funcionando com os valores em texto puro.
  assert.equal(parseEncryptionKey(undefined), null);
  assert.equal(parseEncryptionKey(null), null);
  assert.equal(parseEncryptionKey(''), null);
  assert.equal(parseEncryptionKey('   '), null);
});

test('parseEncryptionKey lança quando a chave existe mas está malformada', () => {
  // Não pode passar batido: seguir em frente gravaria segredo em texto puro
  // enquanto o operador acha que está protegido.
  assert.throws(() => parseEncryptionKey('curta'), EncryptionKeyError);
  assert.throws(() => parseEncryptionKey('zz'.repeat(32)), EncryptionKeyError);
  assert.throws(() => parseEncryptionKey(randomBytes(16).toString('hex')), EncryptionKeyError);
});

// --- ida e volta --------------------------------------------------------------

test('encrypt/decrypt preserva o conteúdo exato', () => {
  const encrypted = encryptSecret(ENV, KEY);
  assert.notEqual(encrypted, ENV);
  assert.equal(decryptSecret(encrypted, KEY), ENV);
});

test('o ciphertext não contém o texto original', () => {
  const encrypted = encryptSecret(ENV, KEY);
  assert.doesNotMatch(encrypted, /senha/);
  assert.doesNotMatch(encrypted, /DATABASE_URL/);
});

test('encrypt gera saída diferente a cada chamada (IV aleatório)', () => {
  // Saída determinística vazaria que dois apps têm o mesmo .env.
  assert.notEqual(encryptSecret(ENV, KEY), encryptSecret(ENV, KEY));
});

test('encrypt/decrypt lida com vazio, unicode e texto grande', () => {
  for (const valor of ['', 'A=1', 'CHAVE=ção-ü-🚀', 'X='.padEnd(100_000, 'y')]) {
    assert.equal(decryptSecret(encryptSecret(valor, KEY), KEY), valor);
  }
});

test('encryptSecret não recriptografa um valor já criptografado', () => {
  const uma = encryptSecret(ENV, KEY);
  assert.equal(encryptSecret(uma, KEY), uma);
});

// --- migração transparente ----------------------------------------------------

test('isEncrypted distingue valor legado de valor criptografado', () => {
  assert.equal(isEncrypted(encryptSecret(ENV, KEY)), true);
  assert.equal(isEncrypted(ENV), false);
  assert.equal(isEncrypted(''), false);
  assert.equal(isEncrypted(null), false);
  assert.equal(isEncrypted(undefined), false);
  assert.equal(isEncrypted(42), false);
});

test('decryptSecret devolve valor legado em texto puro como está', () => {
  // É isto que torna a migração transparente para as linhas que já estão no banco.
  assert.equal(decryptSecret(ENV, KEY), ENV);
  assert.equal(decryptSecret('', KEY), '');
});

// --- falhas -------------------------------------------------------------------

test('decryptSecret lança com a chave errada, em vez de devolver vazio', () => {
  // Devolver '' faria o deploy subir um app de produção sem DATABASE_URL, em silêncio.
  const encrypted = encryptSecret(ENV, KEY);
  assert.throws(() => decryptSecret(encrypted, randomBytes(32)), DecryptionError);
});

test('decryptSecret lança quando o ciphertext foi adulterado', () => {
  // É para isso que serve o GCM: detectar alteração, não só esconder o conteúdo.
  const encrypted = encryptSecret(ENV, KEY);
  const [prefix, iv, tag, data] = [
    ENCRYPTED_PREFIX,
    ...encrypted.slice(ENCRYPTED_PREFIX.length).split(':'),
  ];
  const adulterado = Buffer.from(data, 'base64');
  adulterado[0] ^= 0xff;
  assert.throws(
    () => decryptSecret(`${prefix}${iv}:${tag}:${adulterado.toString('base64')}`, KEY),
    DecryptionError,
  );
});

test('decryptSecret lança com formato malformado', () => {
  assert.throws(() => decryptSecret(`${ENCRYPTED_PREFIX}so-uma-parte`, KEY), DecryptionError);
  assert.throws(() => decryptSecret(`${ENCRYPTED_PREFIX}a:b`, KEY), DecryptionError);
  assert.throws(() => decryptSecret(`${ENCRYPTED_PREFIX}a:b:c`, KEY), DecryptionError);
});

test('a mensagem de erro diz o que fazer', () => {
  try {
    decryptSecret(encryptSecret(ENV, KEY), randomBytes(32));
    assert.fail('deveria ter lançado');
  } catch (error: any) {
    assert.match(error.message, /ENV_ENCRYPTION_KEY/);
    assert.match(error.message, /não são recuperáveis/);
  }
});
