import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PM2_MAX_MEMORY,
  describeLimits,
  dockerLimitFlags,
  isValidCpuLimit,
  isValidMemoryMb,
  normalizeCpuLimit,
  normalizeMemoryMb,
  pm2MaxMemory,
} from './resource-limits.ts';

test('isValidMemoryMb aceita a faixa e recusa o resto', () => {
  assert.equal(isValidMemoryMb(512), true);
  assert.equal(isValidMemoryMb(64), true);
  assert.equal(isValidMemoryMb(63), false, 'nenhum processo Node sobe com menos que isso');
  assert.equal(isValidMemoryMb(100_000), false);
  assert.equal(isValidMemoryMb(512.5), false);
  assert.equal(isValidMemoryMb('512'), false);
  assert.equal(isValidMemoryMb(null), false);
});

test('isValidCpuLimit aceita fração', () => {
  assert.equal(isValidCpuLimit(0.5), true);
  assert.equal(isValidCpuLimit(2), true);
  assert.equal(isValidCpuLimit(0.05), false);
  assert.equal(isValidCpuLimit(100), false);
  assert.equal(isValidCpuLimit(null), false);
});

test('pm2MaxMemory usa o limite do app ou o default antigo', () => {
  assert.equal(pm2MaxMemory(512), '512M');
  // Sem limite configurado, o comportamento é exatamente o que estava fixo no código.
  assert.equal(pm2MaxMemory(null), DEFAULT_PM2_MAX_MEMORY);
  assert.equal(pm2MaxMemory(undefined), DEFAULT_PM2_MAX_MEMORY);
  assert.equal(pm2MaxMemory(10), DEFAULT_PM2_MAX_MEMORY, 'valor inválido cai no default');
});

test('pm2MaxMemory sempre usa M, nunca G', () => {
  // O PM2 não entende `1.5G`; usar M evita o arredondamento.
  assert.equal(pm2MaxMemory(1536), '1536M');
});

test('dockerLimitFlags monta --memory, --memory-swap e --cpus', () => {
  const flags = dockerLimitFlags({ maxMemoryMb: 512, cpuLimit: 1.5 });
  assert.deepEqual(flags, ['--memory=512m', '--memory-swap=512m', '--cpus=1.5']);
});

test('dockerLimitFlags sempre fixa o swap junto com a memória', () => {
  // Sem --memory-swap, o container ganha swap do mesmo tamanho de brinde e o limite
  // efetivo vira o dobro do configurado.
  const flags = dockerLimitFlags({ maxMemoryMb: 256 });
  assert.ok(flags.includes('--memory-swap=256m'));
});

test('dockerLimitFlags devolve vazio sem limite configurado', () => {
  // Mudar o padrão para um valor arbitrário derrubaria apps que hoje usam mais.
  assert.deepEqual(dockerLimitFlags({}), []);
  assert.deepEqual(dockerLimitFlags({ maxMemoryMb: null, cpuLimit: null }), []);
  assert.deepEqual(dockerLimitFlags({ maxMemoryMb: 10 }), [], 'valor inválido é ignorado');
});

test('dockerLimitFlags aceita só um dos dois', () => {
  assert.deepEqual(dockerLimitFlags({ cpuLimit: 0.5 }), ['--cpus=0.5']);
});

test('describeLimits escreve em português', () => {
  assert.equal(describeLimits({ maxMemoryMb: 512, cpuLimit: 1 }), '512MB de RAM, 1 CPU');
  assert.equal(describeLimits({}), 'sem limite configurado');
});

test('normalizeMemoryMb trata o que a UI manda', () => {
  assert.equal(normalizeMemoryMb(''), null);
  assert.equal(normalizeMemoryMb(null), null);
  assert.equal(normalizeMemoryMb('512'), 512);
  assert.equal(normalizeMemoryMb(512), 512);
  assert.equal(normalizeMemoryMb('abc'), 'abc', 'deixa o validador reprovar');
});

test('normalizeCpuLimit aceita vírgula decimal', () => {
  assert.equal(normalizeCpuLimit('0,5'), 0.5);
  assert.equal(normalizeCpuLimit('1.5'), 1.5);
  assert.equal(normalizeCpuLimit(''), null);
  assert.equal(normalizeCpuLimit('muito'), 'muito');
});
