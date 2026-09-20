import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MissingEnvVarError,
  getRegistrationSecret,
  isPermissiveCors,
  parseCorsOrigins,
  requireJwtSecret,
} from './env.ts';

// --- requireJwtSecret ---------------------------------------------------------

test('requireJwtSecret devolve o segredo configurado', () => {
  assert.equal(requireJwtSecret({ JWT_SECRET: 'abc123' }), 'abc123');
  assert.equal(requireJwtSecret({ JWT_SECRET: '  abc123  ' }), 'abc123');
});

test('requireJwtSecret falha sem JWT_SECRET, com instrução acionável', () => {
  for (const env of [{}, { JWT_SECRET: '' }, { JWT_SECRET: '   ' }]) {
    assert.throws(() => requireJwtSecret(env), MissingEnvVarError);
  }

  try {
    requireJwtSecret({});
  } catch (error: any) {
    // A mensagem vai para o terminal de quem roda o update.sh — precisa dizer o que fazer.
    assert.match(error.message, /JWT_SECRET/);
    assert.match(error.message, /openssl rand -hex 32/);
    assert.match(error.message, /backend\/\.env/);
  }
});

test('requireJwtSecret não tem mais fallback embutido', () => {
  // O valor antigo estava publicado no repositório: qualquer pessoa podia forjar um JWT.
  try {
    requireJwtSecret({});
    assert.fail('deveria ter lançado');
  } catch (error: any) {
    assert.doesNotMatch(error.message, /deployhub-secret-key-change-in-production/);
  }
});

// --- getRegistrationSecret ----------------------------------------------------

test('getRegistrationSecret devolve o segredo configurado', () => {
  assert.equal(getRegistrationSecret({ REGISTRATION_SECRET: 'reg123' }), 'reg123');
});

test('getRegistrationSecret devolve null quando não configurado', () => {
  // null faz o /auth/register responder 403 em vez de aceitar 'deployhub-secret-2024'.
  assert.equal(getRegistrationSecret({}), null);
  assert.equal(getRegistrationSecret({ REGISTRATION_SECRET: '' }), null);
  assert.equal(getRegistrationSecret({ REGISTRATION_SECRET: '   ' }), null);
});

// --- parseCorsOrigins ---------------------------------------------------------

test('parseCorsOrigins separa por vírgula e limpa espaços', () => {
  assert.deepEqual(parseCorsOrigins('https://a.com,https://b.com'), [
    'https://a.com',
    'https://b.com',
  ]);
  assert.deepEqual(parseCorsOrigins(' https://a.com , , https://b.com '), [
    'https://a.com',
    'https://b.com',
  ]);
  assert.deepEqual(parseCorsOrigins('https://a.com'), ['https://a.com']);
});

test('parseCorsOrigins cai para permissivo quando a variável não existe', () => {
  // Deliberado: o instalador atual não escreve CORS_ORIGINS, e restringir por padrão
  // derrubaria o painel de toda instalação existente no primeiro update.sh.
  assert.equal(parseCorsOrigins(undefined), true);
  assert.equal(parseCorsOrigins(''), true);
  assert.equal(parseCorsOrigins('  ,  '), true);
});

test('isPermissiveCors distingue lista de permissivo', () => {
  assert.equal(isPermissiveCors(true), true);
  assert.equal(isPermissiveCors(['https://a.com']), false);
});
