import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnsafePathError, assertInside, assertSafeName, isInside, isSafeName } from './paths.ts';

const APPS = '/root/apps';
const WWW = '/var/www';

// --- isInside -----------------------------------------------------------------

test('isInside aceita o próprio root e descendentes', () => {
  assert.equal(isInside('/root/apps', APPS), true);
  assert.equal(isInside('/root/apps/meu-app', APPS), true);
  assert.equal(isInside('/root/apps/meu-app/releases/2026-01-01_00-00-00', APPS), true);
});

test('isInside recusa irmão com prefixo parecido', () => {
  // O bug clássico de comparar com startsWith sem o separador.
  assert.equal(isInside('/root/apps-antigo', APPS), false);
  assert.equal(isInside('/var/www-backup', WWW), false);
});

test('isInside resolve .. antes de comparar', () => {
  assert.equal(isInside('/root/apps/../etc', APPS), false);
  assert.equal(isInside('/root/apps/app/../outro', APPS), true);
});

// --- assertInside -------------------------------------------------------------

test('assertInside devolve o caminho resolvido', () => {
  assert.equal(assertInside('/root/apps/meu-app', [APPS]), '/root/apps/meu-app');
  assert.equal(assertInside('/root/apps/./meu-app/', [APPS]), '/root/apps/meu-app');
});

test('assertInside aceita qualquer uma das raízes', () => {
  assert.equal(assertInside('/var/www/meu-app', [APPS, WWW]), '/var/www/meu-app');
});

test('assertInside recusa caminho fora das raízes', () => {
  assert.throws(() => assertInside('/etc/nginx', [APPS]), UnsafePathError);
  assert.throws(() => assertInside('/', [APPS]), UnsafePathError);
  assert.throws(() => assertInside('/root', [APPS]), UnsafePathError);
});

test('assertInside recusa a própria raiz', () => {
  // `rm -rf /root/apps` nunca é a intenção de uma rotina que quer remover um app.
  assert.throws(() => assertInside('/root/apps', [APPS]), UnsafePathError);
  assert.throws(() => assertInside('/root/apps/', [APPS]), UnsafePathError);
  assert.throws(() => assertInside('/var/www', [APPS, WWW]), UnsafePathError);
});

test('assertInside recusa escapar por ..', () => {
  // O caso que mais assusta: uma linha do banco com um path relativo esquisito
  // chegando no `rm -rf` do cleanup das 3h da manhã.
  assert.throws(() => assertInside('/root/apps/../../etc', [APPS]), UnsafePathError);
  assert.throws(() => assertInside('/root/apps/app/../../../tmp', [APPS]), UnsafePathError);
});

test('assertInside recusa vazio e não-string', () => {
  assert.throws(() => assertInside('', [APPS]), UnsafePathError);
  assert.throws(() => assertInside('   ', [APPS]), UnsafePathError);
  assert.throws(() => assertInside(null as any, [APPS]), UnsafePathError);
  assert.throws(() => assertInside(undefined as any, [APPS]), UnsafePathError);
});

test('assertInside inclui o que estava errado na mensagem', () => {
  try {
    assertInside('/etc/passwd', [APPS], 'diretório da release');
    assert.fail('deveria ter lançado');
  } catch (error: any) {
    assert.match(error.message, /diretório da release/);
    assert.match(error.message, /\/etc\/passwd/);
  }
});

// --- nomes --------------------------------------------------------------------

test('isSafeName aceita nomes de app válidos', () => {
  assert.equal(isSafeName('meu-app'), true);
  assert.equal(isSafeName('app2'), true);
  assert.equal(isSafeName('1app'), true);
  assert.equal(isSafeName('a'), true);
});

test('isSafeName recusa o que quebraria um caminho ou um comando', () => {
  assert.equal(isSafeName('-app'), false);
  assert.equal(isSafeName('meu app'), false);
  assert.equal(isSafeName('meu_app'), false);
  assert.equal(isSafeName('Meu-App'), false);
  assert.equal(isSafeName('../etc'), false);
  assert.equal(isSafeName('app;rm -rf /'), false);
  assert.equal(isSafeName('app$(id)'), false);
  assert.equal(isSafeName(''), false);
  assert.equal(isSafeName('a'.repeat(101)), false);
  assert.equal(isSafeName(null), false);
  assert.equal(isSafeName(42), false);
});

test('assertSafeName devolve o nome ou lança', () => {
  assert.equal(assertSafeName('meu-app'), 'meu-app');
  assert.throws(() => assertSafeName('../etc', 'nome do app'), UnsafePathError);
  try {
    assertSafeName('Meu App', 'nome do app');
  } catch (error: any) {
    assert.match(error.message, /nome do app/);
  }
});
