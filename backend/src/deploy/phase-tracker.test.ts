import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PhaseTracker, formatDuration, parsePhases } from './phase-tracker.ts';

/** Relógio controlado: o teste avança o tempo em vez de esperar. */
function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

test('registra fases em sequência com duração', () => {
  const c = clock();
  const tracker = new PhaseTracker(c.now);

  tracker.start('cloning');
  c.advance(2000);
  tracker.start('installing');
  c.advance(30_000);
  tracker.start('building');
  c.advance(45_000);
  tracker.finish('success');

  const phases = tracker.toArray();
  assert.equal(phases.length, 3);
  assert.deepEqual(phases.map((p) => p.name), ['cloning', 'installing', 'building']);
  assert.deepEqual(phases.map((p) => p.durationMs), [2000, 30_000, 45_000]);
  assert.deepEqual(phases.map((p) => p.status), ['success', 'success', 'success']);
});

test('reentrar na mesma fase não duplica a linha', () => {
  // deployProject chama setPhase('building') uma vez por service; o que interessa é
  // o tempo total da etapa.
  const c = clock();
  const tracker = new PhaseTracker(c.now);

  tracker.start('building');
  c.advance(1000);
  tracker.start('building');
  c.advance(1000);
  tracker.finish('success');

  const phases = tracker.toArray();
  assert.equal(phases.length, 1);
  assert.equal(phases[0].durationMs, 2000);
});

test('a fase em andamento herda o status final do deploy', () => {
  const c = clock();
  const tracker = new PhaseTracker(c.now);
  tracker.start('installing');
  c.advance(500);
  tracker.finish('failed');

  const [phase] = tracker.toArray();
  assert.equal(phase.status, 'failed');
  assert.equal(phase.durationMs, 500);
  assert.ok(phase.finishedAt);
});

test('totalMs mede o deploy inteiro, não só a última fase', () => {
  const c = clock();
  const tracker = new PhaseTracker(c.now);
  c.advance(10_000);
  tracker.start('cloning');
  c.advance(5_000);
  assert.equal(tracker.totalMs(), 15_000);
});

test('toJSON e parsePhases fazem ida e volta', () => {
  const c = clock();
  const tracker = new PhaseTracker(c.now);
  tracker.start('cloning');
  c.advance(1234);
  tracker.finish('success');

  const restaurado = parsePhases(tracker.toJSON());
  assert.equal(restaurado.length, 1);
  assert.equal(restaurado[0].name, 'cloning');
  assert.equal(restaurado[0].durationMs, 1234);
});

test('parsePhases tolera null e JSON inválido', () => {
  assert.deepEqual(parsePhases(null), []);
  assert.deepEqual(parsePhases(undefined), []);
  assert.deepEqual(parsePhases(''), []);
  assert.deepEqual(parsePhases('nao-e-json'), []);
  assert.deepEqual(parsePhases('{"nao":"array"}'), []);
});

test('finish sem fase alguma não quebra', () => {
  const tracker = new PhaseTracker(clock().now);
  tracker.finish('success');
  assert.deepEqual(tracker.toArray(), []);
});

test('formatDuration cobre as faixas que aparecem num deploy', () => {
  assert.equal(formatDuration(820), '820ms');
  assert.equal(formatDuration(45_000), '45s');
  assert.equal(formatDuration(72_000), '1m 12s');
  assert.equal(formatDuration(120_000), '2m');
  assert.equal(formatDuration(3_900_000), '1h 5m');
});

test('formatDuration devolve - para valor ausente ou inválido', () => {
  assert.equal(formatDuration(null), '-');
  assert.equal(formatDuration(undefined), '-');
  assert.equal(formatDuration(-1), '-');
  assert.equal(formatDuration(NaN), '-');
});
