import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actionLabel,
  describeRequest,
  extractEnvKeys,
  isAuditableMethod,
  redactBody,
} from './audit-describe.ts';

// --- a regra mais importante: nenhum segredo entra no log ---------------------

test('envVars vira apenas a lista de NOMES das chaves', () => {
  // Um log de auditoria que guarda valores viraria uma tabela única com todas as
  // senhas que já passaram pelo painel, em texto puro, fora da criptografia da Fase 2.
  const body = {
    envVars: 'DATABASE_URL=postgres://user:SENHA_SECRETA@host/db\nAPI_KEY=chave-secreta\nNODE_ENV=production',
  };
  const redigido = redactBody(body)!;

  assert.deepEqual(redigido.envKeys, ['DATABASE_URL', 'API_KEY', 'NODE_ENV']);
  const serializado = JSON.stringify(redigido);
  assert.doesNotMatch(serializado, /SENHA_SECRETA/);
  assert.doesNotMatch(serializado, /chave-secreta/);
  assert.doesNotMatch(serializado, /postgres:\/\//);
});

test('senha e secret de registro nunca aparecem', () => {
  const redigido = redactBody({ email: 'a@b.c', password: 'minha-senha', secret: 'reg-secret' })!;
  const serializado = JSON.stringify(redigido);
  assert.doesNotMatch(serializado, /minha-senha/);
  assert.doesNotMatch(serializado, /reg-secret/);
  assert.equal(redigido.password, '[redigido]');
  assert.equal(redigido.secret, '[redigido]');
});

test('webhooks e tokens registram a MUDANÇA, não o valor', () => {
  // Saber que alguém trocou o webhook do Slack é auditoria legítima; saber a URL, não.
  const redigido = redactBody({
    slackWebhook: 'https://hooks.slack.com/services/T/B/XXXX',
    telegramBotToken: '123:ABC',
  })!;
  assert.equal(redigido.slackWebhook, '[redigido]');
  assert.equal(redigido.telegramBotToken, '[redigido]');
  assert.doesNotMatch(JSON.stringify(redigido), /hooks\.slack|123:ABC/);
});

test('campo esvaziado é registrado como removido', () => {
  const redigido = redactBody({ slackWebhook: '' })!;
  assert.equal(redigido.slackWebhook, '[removido]');
});

test('allowlist: campo desconhecido é DESCARTADO, não guardado', () => {
  // Allowlist e não denylist: um campo novo no futuro nasce redigido por padrão,
  // em vez de vazar até alguém notar.
  const redigido = redactBody({ name: 'meu-app', campoNovoQueAindaNaoExiste: 'valor sensível' })!;
  assert.equal(redigido.name, 'meu-app');
  assert.equal('campoNovoQueAindaNaoExiste' in redigido, false);
});

test('objeto aninhado é descartado mesmo em campo permitido', () => {
  // `services: [...]` de um create de projeto carrega o envVars de cada service.
  const redigido = redactBody({
    name: 'monorepo',
    services: [{ name: 'api', envVars: 'SECRET=xyz' }],
  })!;
  assert.equal(redigido.name, 'monorepo');
  assert.equal('services' in redigido, false);
  assert.doesNotMatch(JSON.stringify(redigido), /xyz/);
});

test('campos operacionais legítimos passam como estão', () => {
  const redigido = redactBody({
    name: 'meu-app',
    port: 3000,
    domain: 'api.exemplo.com',
    branch: 'main',
    runtime: 'docker',
    maxMemoryMb: 512,
  })!;
  assert.deepEqual(redigido, {
    name: 'meu-app',
    port: 3000,
    domain: 'api.exemplo.com',
    branch: 'main',
    runtime: 'docker',
    maxMemoryMb: 512,
  });
});

test('redactBody devolve null quando não sobra nada', () => {
  assert.equal(redactBody({}), null);
  assert.equal(redactBody(null), null);
  assert.equal(redactBody('texto'), null);
  assert.equal(redactBody([1, 2]), null);
  assert.equal(redactBody({ soCoisaDesconhecida: 1 }), null);
});

// --- extractEnvKeys -----------------------------------------------------------

test('extractEnvKeys ignora comentário, linha vazia e linha sem =', () => {
  const chaves = extractEnvKeys('# comentário\n\nA=1\nSEM_IGUAL\nB=2\n=SEM_CHAVE');
  assert.deepEqual(chaves, ['A', 'B']);
});

test('extractEnvKeys tolera entrada inútil', () => {
  assert.deepEqual(extractEnvKeys(null), []);
  assert.deepEqual(extractEnvKeys(''), []);
  assert.deepEqual(extractEnvKeys(42), []);
});

// --- mapeamento de rotas ------------------------------------------------------

test('isAuditableMethod ignora GET', () => {
  // Auditar leitura seria ruído: o Dashboard faz polling de 4 endpoints a cada 5s.
  assert.equal(isAuditableMethod('GET'), false);
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'delete']) {
    assert.equal(isAuditableMethod(m), true, m);
  }
});

test('describeRequest reconhece as rotas mapeadas', () => {
  assert.deepEqual(describeRequest('DELETE', '/api/apps/:id'), {
    action: 'app.delete',
    targetType: 'app',
    targetIdFrom: 'id',
  });
  assert.equal(describeRequest('POST', '/api/apps/:id/apply-env').action, 'env.apply');
  assert.equal(describeRequest('POST', '/api/projects/:id/services').action, 'service.add');
});

test('rota não mapeada ainda é auditada, com rótulo derivado', () => {
  // Auditar de menos é pior que auditar com um rótulo feio: um endpoint novo aparece
  // na trilha mesmo que ninguém lembre de mapeá-lo.
  const d = describeRequest('POST', '/api/algo/novo/:id');
  assert.equal(d.action, 'algo.novo.post');
  assert.equal(d.targetType, null);
});

test('actionLabel traduz e passa o desconhecido adiante', () => {
  assert.equal(actionLabel('app.delete'), 'App excluído');
  assert.equal(actionLabel('acao.inventada'), 'acao.inventada');
});
