import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpuUsageFromProcStat,
  parseCpuUsage, parseDiskUsage } from './system-parse.ts';

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

// --- CPU ociosa reportada como 100% ------------------------------------------

test('máquina ociosa não vira CPU 100%', () => {
  // A linha real do `top` numa máquina sem carga: o `100.0 id` vem colado na vírgula
  // do campo anterior. A regex antiga capturava ",100.0" e o painel anunciava 100%.
  const linha = '%Cpu(s):  0.0 us,  0.0 sy,  0.0 ni,100.0 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st';
  assert.equal(parseCpuUsage(linha), 0);
});

test('CPU com carga continua correta', () => {
  assert.equal(parseCpuUsage('%Cpu(s):  0.6 us,  0.3 sy,  0.0 ni, 99.1 id,  0.0 wa'), 1);
  assert.equal(parseCpuUsage('%Cpu(s): 25.0 us,  5.0 sy,  0.0 ni, 70.0 id'), 30);
});

test('locale com vírgula decimal', () => {
  assert.equal(parseCpuUsage('%Cpu(s):  1,0 us,  0,5 sy,  0,0 ni, 94,9 id'), 5);
});

test('formato sem espaço antes de id', () => {
  assert.equal(parseCpuUsage('%Cpu(s): 10.0 us, 5.0 sy, 0.0 ni,85.0%id'), 15);
});

test('cpuUsageFromProcStat mede a variação, não o acumulado', () => {
  // 100 ticks decorridos, 75 deles ociosos -> 25% de uso.
  const antes = 'cpu  1000 0 500 8000 100 0 0 0 0 0\ncpu0 1 2 3 4 5';
  const depois = 'cpu  1010 0 515 8070 105 0 0 0 0 0\ncpu0 1 2 3 4 5';
  assert.equal(cpuUsageFromProcStat(antes, depois), 25);
});

test('cpuUsageFromProcStat trata iowait como ocioso', () => {
  const antes = 'cpu  100 0 100 800 0 0 0 0';
  const depois = 'cpu  100 0 100 800 100 0 0 0';
  // Só iowait cresceu: a CPU não fez trabalho nenhum.
  assert.equal(cpuUsageFromProcStat(antes, depois), 0);
});

test('cpuUsageFromProcStat recusa amostras impossíveis', () => {
  const amostra = 'cpu  100 0 100 800 0 0 0 0';
  // Sem variação: nada a medir.
  assert.equal(cpuUsageFromProcStat(amostra, amostra), null);
  // Contador andou para trás (reboot entre as leituras).
  assert.equal(cpuUsageFromProcStat('cpu  100 0 100 800 0', 'cpu  10 0 10 80 0'), null);
  assert.equal(cpuUsageFromProcStat('sem cpu aqui', amostra), null);
});
