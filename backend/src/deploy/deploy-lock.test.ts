import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeployLock, lockedMessage } from './deploy-lock.ts';

test('acquire trava e o segundo pedido é recusado', () => {
  const lock = new DeployLock();
  assert.ok(lock.acquire('meu-app'), 'primeiro deploy entra');
  assert.equal(lock.acquire('meu-app'), null, 'o segundo é recusado');
  assert.equal(lock.isLocked('meu-app'), true);
});

test('chaves diferentes não se bloqueiam', () => {
  const lock = new DeployLock();
  assert.ok(lock.acquire('app-a'));
  assert.ok(lock.acquire('app-b'), 'outro app pode deployar em paralelo');
});

test('release libera e permite um novo deploy', () => {
  const lock = new DeployLock();
  lock.acquire('meu-app');
  lock.release('meu-app');
  assert.equal(lock.isLocked('meu-app'), false);
  assert.ok(lock.acquire('meu-app'));
});

test('release é idempotente', () => {
  const lock = new DeployLock();
  lock.release('nunca-travado');
  lock.acquire('x');
  lock.release('x');
  lock.release('x');
  assert.equal(lock.isLocked('x'), false);
});

test('guarda quem está segurando a trava', () => {
  const lock = new DeployLock();
  lock.acquire('meu-app', { source: 'webhook' });
  lock.attachDeployId('meu-app', 'deploy-123');

  const info = lock.info('meu-app');
  assert.equal(info?.source, 'webhook');
  assert.equal(info?.deployId, 'deploy-123');
  assert.ok(info?.startedAt instanceof Date);
});

test('keys lista o que está travado', () => {
  const lock = new DeployLock();
  lock.acquire('a');
  lock.acquire('b');
  assert.deepEqual(lock.keys().sort(), ['a', 'b']);
});

test('lockedMessage explica quem está segurando e há quanto tempo', () => {
  const lock = new DeployLock();
  const info = lock.acquire('meu-app', { source: 'webhook' })!;
  info.startedAt = new Date(Date.now() - 125_000);

  const message = lockedMessage(info);
  assert.match(message, /meu-app/);
  assert.match(message, /2min/);
  assert.match(message, /webhook/);
});

test('lockedMessage usa segundos para deploys recentes', () => {
  const lock = new DeployLock();
  const info = lock.acquire('meu-app')!;
  info.startedAt = new Date(Date.now() - 5_000);
  assert.match(lockedMessage(info), /5s/);
});
