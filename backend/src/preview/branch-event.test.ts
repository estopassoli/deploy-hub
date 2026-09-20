import test from 'node:test';
import assert from 'node:assert/strict';
import { branchFromRef, parseBranchEvent } from './branch-event.ts';

test('branchFromRef tira o prefixo refs/heads/', () => {
  assert.equal(branchFromRef('refs/heads/main'), 'main');
  assert.equal(branchFromRef('refs/heads/feat/login-social'), 'feat/login-social');
});

test('branchFromRef aceita o nome puro que create/delete mandam', () => {
  assert.equal(branchFromRef('feat/login'), 'feat/login');
});

test('branchFromRef recusa refs que não são branch', () => {
  assert.equal(branchFromRef('refs/tags/v1.0.0'), '');
  assert.equal(branchFromRef('refs/pull/12/head'), '');
  assert.equal(branchFromRef(''), '');
  assert.equal(branchFromRef(undefined), '');
  assert.equal(branchFromRef(null), '');
  assert.equal(branchFromRef(42), '');
});

test('push numa branch é evento de push', () => {
  const evento = parseBranchEvent('push', { ref: 'refs/heads/feat/login', deleted: false });
  assert.deepEqual(evento, { kind: 'push', branch: 'feat/login' });
});

test('push em tag é ignorado', () => {
  const evento = parseBranchEvent('push', { ref: 'refs/tags/v2' });
  assert.equal(evento.kind, 'ignore');
});

test('push com deleted: true é remoção de branch', () => {
  // Apagar uma branch pelo git chega assim quando o webhook só assina `push`.
  const evento = parseBranchEvent('push', { ref: 'refs/heads/feat/login', deleted: true });
  assert.deepEqual(evento, { kind: 'delete', branch: 'feat/login' });
});

test('push com after zerado também é remoção', () => {
  const evento = parseBranchEvent('push', {
    ref: 'refs/heads/feat/login',
    after: '0000000000000000000000000000000000000000',
  });
  assert.equal(evento.kind, 'delete');
  assert.equal(evento.branch, 'feat/login');
});

test('evento delete de branch é remoção', () => {
  const evento = parseBranchEvent('delete', { ref: 'feat/login', ref_type: 'branch' });
  assert.deepEqual(evento, { kind: 'delete', branch: 'feat/login' });
});

test('delete de tag não derruba preview', () => {
  // Apagar `v1.0.0` não pode remover um preview chamado `v1-0-0`.
  const evento = parseBranchEvent('delete', { ref: 'v1.0.0', ref_type: 'tag' });
  assert.equal(evento.kind, 'ignore');
});

test('create de branch não sobe preview', () => {
  const evento = parseBranchEvent('create', { ref: 'feat/login', ref_type: 'branch' });
  assert.equal(evento.kind, 'ignore');
  assert.match(evento.reason!, /primeiro push/);
});

test('eventos que não são de branch são ignorados com o nome no motivo', () => {
  const evento = parseBranchEvent('issues', { action: 'opened' });
  assert.equal(evento.kind, 'ignore');
  assert.match(evento.reason!, /issues/);
});

test('payload ausente não quebra o parser', () => {
  assert.equal(parseBranchEvent('push', null).kind, 'ignore');
  assert.equal(parseBranchEvent('', undefined).kind, 'ignore');
});
