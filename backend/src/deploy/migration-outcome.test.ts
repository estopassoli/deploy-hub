import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyMigrationOutcome } from './migration-outcome.ts';

test('saída 0 é sucesso', () => {
  assert.equal(classifyMigrationOutcome(0, 'Applying migration `20260101_init`'), 'applied');
  assert.equal(classifyMigrationOutcome(0, ''), 'applied');
});

test('saída 0 com "nada pendente" é reconhecida como tal', () => {
  assert.equal(classifyMigrationOutcome(0, 'No pending migrations to apply.'), 'nothing-to-apply');
  assert.equal(classifyMigrationOutcome(0, 'Database schema is up to date!'), 'nothing-to-apply');
});

test('erro real do Prisma FALHA o deploy', () => {
  // Era isto que o catch engolia: o deploy seguia e trocava o symlink com o schema
  // desatualizado, e o erro aparecia depois, em runtime, longe da causa.
  const saidas = [
    'Error: P3006 Migration `x` failed to apply cleanly to the shadow database.',
    'Error: P1001: Can\'t reach database server at `db:5432`',
    'Error: connect ECONNREFUSED 127.0.0.1:5432',
    'Migration engine error',
    'syntax error at or near "CREAT"',
    'permission denied for table users',
  ];
  for (const saida of saidas) {
    assert.equal(classifyMigrationOutcome(1, saida), 'failed', saida);
  }
});

test('saída != 0 sem assinatura conhecida falha (lado seguro)', () => {
  assert.equal(classifyMigrationOutcome(1, 'algo estranho aconteceu'), 'failed');
  assert.equal(classifyMigrationOutcome(127, 'command not found'), 'failed');
  assert.equal(classifyMigrationOutcome(1, ''), 'failed');
});

test('erro real tem prioridade sobre a frase de "nada a aplicar"', () => {
  const saida = 'No pending migrations to apply.\nError: P1001 Can\'t reach database server';
  assert.equal(classifyMigrationOutcome(1, saida), 'failed');
});

test('ferramenta que sai != 0 dizendo que não havia nada não derruba o deploy', () => {
  assert.equal(classifyMigrationOutcome(1, 'No migrations were found'), 'nothing-to-apply');
  assert.equal(classifyMigrationOutcome(1, 'nothing to migrate'), 'nothing-to-apply');
});
