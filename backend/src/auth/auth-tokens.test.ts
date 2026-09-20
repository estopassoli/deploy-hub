import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractBearerToken,
  extractHandshakeToken,
  getSocketUser,
  safeCompareSecret,
} from './auth-tokens.ts';

// --- extractBearerToken -------------------------------------------------------

test('extractBearerToken lê o token de um header Bearer', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('Bearer    abc'), 'abc');
});

test('extractBearerToken devolve null para header ausente ou malformado', () => {
  assert.equal(extractBearerToken(undefined), null);
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken(''), null);
  assert.equal(extractBearerToken('abc.def.ghi'), null);
  assert.equal(extractBearerToken('Basic dXNlcjpwYXNz'), null);
  assert.equal(extractBearerToken('Bearer '), null);
  assert.equal(extractBearerToken(123), null);
});

// --- extractHandshakeToken ----------------------------------------------------

test('extractHandshakeToken prefere handshake.auth.token', () => {
  const token = extractHandshakeToken({
    auth: { token: 'do-auth' },
    headers: { authorization: 'Bearer do-header' },
  });
  assert.equal(token, 'do-auth');
});

test('extractHandshakeToken cai para o header Authorization', () => {
  assert.equal(
    extractHandshakeToken({ auth: {}, headers: { authorization: 'Bearer do-header' } }),
    'do-header',
  );
  assert.equal(
    extractHandshakeToken({ auth: { token: '   ' }, headers: { authorization: 'Bearer do-header' } }),
    'do-header',
  );
});

test('extractHandshakeToken ignora a query string', () => {
  // De propósito: a query aparece em log de acesso do nginx e em Referer.
  const token = extractHandshakeToken({ query: { token: 'da-query' } } as any);
  assert.equal(token, null);
});

test('extractHandshakeToken devolve null sem token', () => {
  assert.equal(extractHandshakeToken(null), null);
  assert.equal(extractHandshakeToken(undefined), null);
  assert.equal(extractHandshakeToken({}), null);
  assert.equal(extractHandshakeToken({ auth: null, headers: null }), null);
  assert.equal(extractHandshakeToken({ auth: { token: 42 } }), null);
});

// --- safeCompareSecret --------------------------------------------------------

test('safeCompareSecret aceita segredos iguais', () => {
  assert.equal(safeCompareSecret('s3cr3t', 's3cr3t'), true);
});

test('safeCompareSecret rejeita segredos diferentes, inclusive de tamanhos diferentes', () => {
  assert.equal(safeCompareSecret('s3cr3t', 's3cr3T'), false);
  assert.equal(safeCompareSecret('s3', 's3cr3t'), false);
  assert.equal(safeCompareSecret('s3cr3t-e-mais', 's3cr3t'), false);
});

test('safeCompareSecret rejeita valores não-string e segredo esperado vazio', () => {
  assert.equal(safeCompareSecret(undefined, 's3cr3t'), false);
  assert.equal(safeCompareSecret('s3cr3t', undefined), false);
  assert.equal(safeCompareSecret(null, null), false);
  assert.equal(safeCompareSecret(123, 123), false);
  // Um segredo esperado vazio nunca casa — senão um .env sem a variável autorizaria
  // qualquer um mandando ''.
  assert.equal(safeCompareSecret('', ''), false);
});

// --- getSocketUser ------------------------------------------------------------

test('getSocketUser devolve o usuário anexado pelo middleware', () => {
  const user = getSocketUser({ data: { user: { userId: 'u1', email: 'a@b.c' } } });
  assert.deepEqual(user, { userId: 'u1', email: 'a@b.c' });
});

test('getSocketUser devolve null para socket não autenticado', () => {
  assert.equal(getSocketUser(null), null);
  assert.equal(getSocketUser(undefined), null);
  assert.equal(getSocketUser({}), null);
  assert.equal(getSocketUser({ data: {} }), null);
  assert.equal(getSocketUser({ data: { user: {} } }), null);
  assert.equal(getSocketUser({ data: { user: { userId: '' } } }), null);
  assert.equal(getSocketUser({ data: { user: { userId: 42 } } }), null);
});
