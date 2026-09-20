import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeEnvDiff, diffEnv, parseEnvText, requiresRebuild } from './env-diff.ts';

test('parseEnvText lê o formato que o painel grava', () => {
  const texto = [
    '# comentário',
    '',
    'DATABASE_URL=postgres://user:pass@host/db',
    '  SPACED = com espaço  ',
    'QUOTED="entre aspas"',
    "SINGLE='aspas simples'",
    'URL_COM_IGUAL=postgres://a?x=1&y=2',
    'SEM_IGUAL',
    '=SEM_CHAVE',
  ].join('\n');

  assert.deepEqual(parseEnvText(texto), {
    DATABASE_URL: 'postgres://user:pass@host/db',
    SPACED: 'com espaço',
    QUOTED: 'entre aspas',
    SINGLE: 'aspas simples',
    URL_COM_IGUAL: 'postgres://a?x=1&y=2',
  });
});

test('parseEnvText tolera vazio e null', () => {
  assert.deepEqual(parseEnvText(null), {});
  assert.deepEqual(parseEnvText(undefined), {});
  assert.deepEqual(parseEnvText(''), {});
});

test('diffEnv separa adicionadas, alteradas e removidas', () => {
  const diff = diffEnv('A=1\nB=2\nC=3', 'A=1\nB=99\nD=4');
  assert.deepEqual(diff.added, ['D']);
  assert.deepEqual(diff.changed, ['B']);
  assert.deepEqual(diff.removed, ['C']);
  assert.equal(diff.isEmpty, false);
});

test('diffEnv reconhece quando nada mudou', () => {
  const diff = diffEnv('A=1\nB=2', 'B=2\nA=1');
  assert.equal(diff.isEmpty, true);
  assert.deepEqual(diff.buildRequired, []);
});

test('diffEnv marca NEXT_PUBLIC_ e VITE_ como exigindo rebuild', () => {
  // O caso que motiva tudo isto: reiniciar não muda o valor que já foi embutido no
  // bundle, e o painel diria "salvo" enquanto o frontend segue apontando para a API
  // antiga.
  const diff = diffEnv(
    'DATABASE_URL=a\nNEXT_PUBLIC_API=/v1\nVITE_URL=x',
    'DATABASE_URL=b\nNEXT_PUBLIC_API=/v2\nVITE_URL=y',
  );
  assert.deepEqual(diff.changed, ['DATABASE_URL', 'NEXT_PUBLIC_API', 'VITE_URL']);
  assert.deepEqual(diff.buildRequired, ['NEXT_PUBLIC_API', 'VITE_URL']);
});

test('diffEnv marca rebuild também para chave pública adicionada ou removida', () => {
  assert.deepEqual(diffEnv('A=1', 'A=1\nNEXT_PUBLIC_X=1').buildRequired, ['NEXT_PUBLIC_X']);
  assert.deepEqual(diffEnv('VITE_Y=1', '').buildRequired, ['VITE_Y']);
});

test('mudança só em variável de runtime não exige rebuild', () => {
  const diff = diffEnv('DATABASE_URL=a\nREDIS_URL=b', 'DATABASE_URL=z\nREDIS_URL=b');
  assert.deepEqual(diff.changed, ['DATABASE_URL']);
  assert.deepEqual(diff.buildRequired, [], 'reiniciar basta');
});

test('requiresRebuild reconhece só os prefixos públicos', () => {
  assert.equal(requiresRebuild('NEXT_PUBLIC_API_URL'), true);
  assert.equal(requiresRebuild('VITE_API_URL'), true);
  assert.equal(requiresRebuild('DATABASE_URL'), false);
  assert.equal(requiresRebuild('PUBLIC_URL'), false);
  assert.equal(requiresRebuild('MY_NEXT_PUBLIC_X'), false);
});

test('describeEnvDiff resume para a UI', () => {
  assert.equal(describeEnvDiff(diffEnv('A=1', 'A=1')), 'nenhuma variável mudou');
  assert.match(describeEnvDiff(diffEnv('A=1\nB=2', 'A=9\nC=3')), /1 adicionada\(s\)/);
  assert.match(describeEnvDiff(diffEnv('A=1\nB=2', 'A=9\nC=3')), /1 alterada\(s\)/);
  assert.match(describeEnvDiff(diffEnv('A=1\nB=2', 'A=9\nC=3')), /1 removida\(s\)/);
});
