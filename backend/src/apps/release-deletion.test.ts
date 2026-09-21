import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteRelease, selectDeletable, selectPrunable, type DeletableRelease } from './release-deletion.ts';

const release = (over: Partial<DeletableRelease> = {}): DeletableRelease => ({
  id: 'd1',
  version: '2026-09-20_03-00-00',
  path: '/root/apps/aura/releases/2026-09-20_03-00-00',
  isCurrent: false,
  status: 'success',
  createdAt: new Date('2026-09-20T03:00:00Z'),
  ...over,
});

test('release comum pode ser apagada', () => {
  assert.deepEqual(canDeleteRelease(release(), null), { allowed: true });
});

test('a release atual nunca é apagada', () => {
  const r = canDeleteRelease(release({ isCurrent: true }), null);
  assert.equal(r.allowed, false);
  assert.match((r as any).reason, /no ar/);
});

test('release sem caminho é recusada em vez de virar linha órfã', () => {
  const r = canDeleteRelease(release({ path: null }), null);
  assert.equal(r.allowed, false);
  assert.match((r as any).reason, /diretório/);
});

test('o symlink current vence o banco', () => {
  // O cenário que isto evita: `isCurrent` false no banco, mas o disco servindo dali.
  const alvo = '/root/apps/aura/releases/2026-09-20_03-00-00';
  const r = canDeleteRelease(release({ isCurrent: false }), alvo);
  assert.equal(r.allowed, false);
  assert.match((r as any).reason, /symlink/);
});

test('barra final não engana a comparação de caminho', () => {
  const r = canDeleteRelease(release(), '/root/apps/aura/releases/2026-09-20_03-00-00/');
  assert.equal(r.allowed, false);
});

test('caminho parecido mas diferente não é bloqueado', () => {
  // `.../2026-09-20_03-00-00` vs `.../2026-09-20_03-00-000` — prefixo igual, release outra.
  const r = canDeleteRelease(release(), '/root/apps/aura/releases/2026-09-20_03-00-000');
  assert.equal(r.allowed, true);
});

const serie = (): DeletableRelease[] => [
  release({ id: 'atual', version: 'v5', isCurrent: true, createdAt: new Date('2026-09-20T05:00:00Z'), path: '/r/v5' }),
  release({ id: 'v4', version: 'v4', createdAt: new Date('2026-09-19T04:00:00Z'), path: '/r/v4' }),
  release({ id: 'v3', version: 'v3', createdAt: new Date('2026-09-18T03:00:00Z'), path: '/r/v3' }),
  release({ id: 'v2', version: 'v2', createdAt: new Date('2026-09-17T02:00:00Z'), path: '/r/v2' }),
  release({ id: 'v1', version: 'v1', createdAt: new Date('2026-09-16T01:00:00Z'), path: '/r/v1' }),
];

test('keep: 0 apaga tudo menos a atual', () => {
  const { toDelete, kept } = selectPrunable(serie(), { keep: 0, currentTarget: null });
  assert.deepEqual(toDelete.map((r) => r.id), ['v4', 'v3', 'v2', 'v1']);
  assert.deepEqual(kept.map((r) => r.id), ['atual']);
});

test('keep conta sem incluir a atual', () => {
  // "manter 2" = a atual + as 2 mais recentes depois dela.
  const { toDelete, kept } = selectPrunable(serie(), { keep: 2, currentTarget: null });
  assert.deepEqual(toDelete.map((r) => r.id), ['v2', 'v1']);
  assert.deepEqual(kept.map((r) => r.id), ['atual', 'v4', 'v3']);
});

test('keep maior que o total não apaga nada', () => {
  const { toDelete } = selectPrunable(serie(), { keep: 99, currentTarget: null });
  assert.deepEqual(toDelete, []);
});

test('a ordem de entrada não importa — a seleção reordena por data', () => {
  const embaralhada = [...serie()].reverse();
  const { toDelete } = selectPrunable(embaralhada, { keep: 1, currentTarget: null });
  assert.deepEqual(toDelete.map((r) => r.id), ['v3', 'v2', 'v1']);
});

test('release sem caminho é mantida e não consome a cota de keep', () => {
  const lista = [
    release({ id: 'atual', isCurrent: true, createdAt: new Date('2026-09-20T05:00:00Z') }),
    release({ id: 'semPath', path: null, createdAt: new Date('2026-09-19T05:00:00Z') }),
    release({ id: 'v3', path: '/r/v3', createdAt: new Date('2026-09-18T05:00:00Z') }),
    release({ id: 'v2', path: '/r/v2', createdAt: new Date('2026-09-17T05:00:00Z') }),
  ];
  const { toDelete, kept } = selectPrunable(lista, { keep: 1, currentTarget: null });
  assert.deepEqual(kept.map((r) => r.id), ['atual', 'semPath', 'v3']);
  assert.deepEqual(toDelete.map((r) => r.id), ['v2']);
});

test('o alvo do symlink protege mesmo dentro do lote', () => {
  const { toDelete, kept } = selectPrunable(serie(), { keep: 0, currentTarget: '/r/v3' });
  assert.equal(toDelete.some((r) => r.id === 'v3'), false);
  assert.equal(kept.some((r) => r.id === 'v3'), true);
});

// --- seleção em lote ----------------------------------------------------------

const lote = (): DeletableRelease[] => [
  release({ id: 'atual', version: 'v4', isCurrent: true, path: '/r/v4', createdAt: new Date('2026-09-20T04:00:00Z') }),
  release({ id: 'v3', version: 'v3', path: '/r/v3', createdAt: new Date('2026-09-19T03:00:00Z') }),
  release({ id: 'v2', version: 'v2', path: '/r/v2', createdAt: new Date('2026-09-18T02:00:00Z') }),
  release({ id: 'semPath', version: 'v1', path: null, createdAt: new Date('2026-09-17T01:00:00Z') }),
];

test('selectDeletable só considera os ids pedidos', () => {
  const { toDelete, refused } = selectDeletable(lote(), ['v2'], [null]);
  assert.deepEqual(toDelete.map((r) => r.id), ['v2']);
  assert.deepEqual(refused, []);
});

test('selectDeletable devolve o motivo de cada recusa, sem abortar o lote', () => {
  const { toDelete, refused } = selectDeletable(lote(), ['atual', 'v3', 'semPath'], [null]);
  assert.deepEqual(toDelete.map((r) => r.id), ['v3']);
  assert.deepEqual(refused.map((r) => r.release.id), ['atual', 'semPath']);
  assert.match(refused[0].reason, /no ar/);
  assert.match(refused[1].reason, /diretório/);
});

test('basta UM symlink de service apontar para a release', () => {
  // Monorepo: cada service tem seu `current`. v2 é alvo do segundo.
  const { toDelete, refused } = selectDeletable(lote(), ['v3', 'v2'], ['/r/outro', '/r/v2', null]);
  assert.deepEqual(toDelete.map((r) => r.id), ['v3']);
  assert.deepEqual(refused.map((r) => r.release.id), ['v2']);
  assert.match(refused[0].reason, /symlink/);
});

test('id inexistente na lista é simplesmente ignorado', () => {
  const { toDelete, refused } = selectDeletable(lote(), ['v3', 'nao-existe'], [null]);
  assert.deepEqual(toDelete.map((r) => r.id), ['v3']);
  assert.deepEqual(refused, []);
});

test('seleção vazia não apaga nada', () => {
  const { toDelete, refused } = selectDeletable(lote(), [], [null]);
  assert.deepEqual(toDelete, []);
  assert.deepEqual(refused, []);
});
