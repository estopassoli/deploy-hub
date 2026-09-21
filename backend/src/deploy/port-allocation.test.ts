import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatePorts, isReserved, parseListeningPorts } from './port-allocation.ts';

const vazio = { usedByApps: [], listening: [] };

test('aloca a partir do início padrão quando tudo está livre', () => {
  assert.deepEqual(allocatePorts(3, vazio), [3000, 3001, 3002]);
});

test('pula portas já usadas por apps', () => {
  assert.deepEqual(allocatePorts(3, { usedByApps: [3000, 3002], listening: [] }), [3001, 3003, 3004]);
});

test('pula portas com alguém escutando, mesmo sem app cadastrado', () => {
  // O caso que o checkPort antigo deixava passar: porta livre no banco, ocupada no SO.
  assert.deepEqual(allocatePorts(2, { usedByApps: [], listening: [3000, 3001] }), [3002, 3003]);
});

test('nunca entrega as portas do próprio painel', () => {
  const portas = allocatePorts(3, { usedByApps: [], listening: [], start: 9999 });
  assert.deepEqual(portas, [9999, 10002, 10003]);
  assert.equal(portas.includes(10000), false);
  assert.equal(portas.includes(10001), false);
});

test('não repete porta dentro do mesmo lote', () => {
  // Um monorepo pede N de uma vez; devolver duas iguais quebraria no start.
  const portas = allocatePorts(6, vazio);
  assert.equal(new Set(portas).size, 6);
});

test('respeita portas já escolhidas no formulário aberto', () => {
  assert.deepEqual(allocatePorts(2, { ...vazio, alsoAvoid: [3000, 3001] }), [3002, 3003]);
});

test('devolve menos que o pedido quando a faixa acaba, em vez de repetir', () => {
  assert.deepEqual(allocatePorts(5, { ...vazio, start: 8000, end: 8002 }), [8000, 8001, 8002]);
});

test('faixa sem nenhuma porta livre devolve lista vazia', () => {
  assert.deepEqual(allocatePorts(2, { usedByApps: [8000, 8001], listening: [], start: 8000, end: 8001 }), []);
});

test('count inválido devolve vazio', () => {
  assert.deepEqual(allocatePorts(0, vazio), []);
  assert.deepEqual(allocatePorts(-1, vazio), []);
  assert.deepEqual(allocatePorts(1.5, vazio), []);
});

test('nunca desce abaixo de 1024', () => {
  assert.deepEqual(allocatePorts(2, { ...vazio, start: 80 }), [1024, 1025]);
  assert.equal(isReserved(80), true);
  assert.equal(isReserved(1023), true);
  assert.equal(isReserved(1024), false);
});

test('parseListeningPorts lê só as linhas em LISTEN', () => {
  const proc = [
    '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 0100007F:2711 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12345 1',
    '   1: 0100007F:0BB8 0100007F:C350 01 00000000:00000000 00:00000000 00000000     0        0 12346 1',
    '   2: 00000000:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12347 1',
  ].join('\n');

  // 0x2711 = 10001 (o painel), 0x1F90 = 8080. A linha do meio está ESTABLISHED (01).
  assert.deepEqual(parseListeningPorts(proc), [8080, 10001]);
});

test('parseListeningPorts tolera arquivo vazio ou truncado', () => {
  assert.deepEqual(parseListeningPorts(''), []);
  assert.deepEqual(parseListeningPorts('cabeçalho só'), []);
  assert.deepEqual(parseListeningPorts('  sl local\n   0: lixo'), []);
});
