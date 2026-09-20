import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCpuUsage, parseDiskUsage } from './system-parse.ts';

test('parseDiskUsage lê a coluna de capacidade do df -P', () => {
  const saida = [
    'Filesystem     1024-blocks      Used Available Capacity Mounted on',
    '/dev/sda1        102687672  48260228  49168476      50% /',
  ].join('\n');
  assert.equal(parseDiskUsage(saida), 50);
});

test('parseDiskUsage ignora o cabeçalho', () => {
  // Sem pular a primeira linha, um cabeçalho com "%" daria um número errado.
  assert.equal(parseDiskUsage('Capacity 100%\n/dev/sda1 20% /'), 20);
});

test('parseDiskUsage lida com 0% e 100%', () => {
  assert.equal(parseDiskUsage('h\n/dev/x 0% /'), 0);
  assert.equal(parseDiskUsage('h\n/dev/x 100% /'), 100);
});

test('parseDiskUsage devolve null quando não reconhece a saída', () => {
  assert.equal(parseDiskUsage(''), null);
  assert.equal(parseDiskUsage('df: comando não encontrado'), null);
  assert.equal(parseDiskUsage('Filesystem Capacity\n'), null);
});

test('parseCpuUsage calcula a partir do idle, no formato com ponto', () => {
  const saida = '%Cpu(s):  3.4 us,  1.2 sy,  0.0 ni, 94.9 id,  0.5 wa';
  assert.equal(parseCpuUsage(saida), 5); // 100 - 94.9 = 5.1 -> 5
});

test('parseCpuUsage aceita vírgula decimal (locale pt_BR)', () => {
  const saida = '%Cpu(s):  3,4 us,  1,2 sy,  0,0 ni, 90,0 id,  0,5 wa';
  assert.equal(parseCpuUsage(saida), 10);
});

test('parseCpuUsage aceita o formato antigo sem espaço', () => {
  const saida = 'Cpu(s):  3.4%us,  1.2%sy,  0.0%ni, 80.0%id,  0.5%wa';
  assert.equal(parseCpuUsage(saida), 20);
});

test('parseCpuUsage encontra a linha no meio da saída do top', () => {
  const saida = [
    'top - 03:20:01 up 12 days,  4:33,  1 user,  load average: 0.15, 0.20, 0.18',
    'Tasks: 210 total,   1 running, 209 sleeping,   0 stopped,   0 zombie',
    '%Cpu(s):  1.0 us,  0.5 sy,  0.0 ni, 98.5 id,  0.0 wa',
    'MiB Mem :  15888.0 total,   1200.0 free,   8000.0 used',
  ].join('\n');
  assert.equal(parseCpuUsage(saida), 2);
});

test('parseCpuUsage devolve null quando não reconhece a saída', () => {
  // Antes isso virava NaN e aparecia como 0% no Dashboard, sem distinguir
  // "máquina ociosa" de "não consegui medir".
  assert.equal(parseCpuUsage(''), null);
  assert.equal(parseCpuUsage('top: command not found'), null);
  assert.equal(parseCpuUsage('%Cpu(s): sem números aqui'), null);
});
