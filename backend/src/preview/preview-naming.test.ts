import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allocatePort,
  branchMatchesPattern,
  branchToSlug,
  expiredPreviews,
  parsePortRange,
  previewAppName,
  previewDomain,
} from './preview-naming.ts';

// --- slug da branch -----------------------------------------------------------

test('branchToSlug transforma a branch em rótulo de DNS', () => {
  assert.equal(branchToSlug('feat/login-social'), 'feat-login-social');
  assert.equal(branchToSlug('fix/BUG_123'), 'fix-bug-123');
  assert.equal(branchToSlug('release/v1.2.3'), 'release-v1-2-3');
  assert.equal(branchToSlug('main'), 'main');
});

test('branchToSlug remove acento', () => {
  // Rótulo de DNS não aceita acento; sem normalizar, o subdomínio sairia inválido.
  assert.equal(branchToSlug('feat/configuração'), 'feat-configuracao');
});

test('branchToSlug respeita o limite de 63 caracteres sem terminar em hífen', () => {
  const slug = branchToSlug('feat/' + 'a'.repeat(100))!;
  assert.ok(slug.length <= 63);
  assert.ok(!slug.endsWith('-'));
});

test('branchToSlug recusa branch sem nada aproveitável', () => {
  // Melhor recusar o preview que inventar um subdomínio que não corresponde à branch.
  assert.equal(branchToSlug('///'), null);
  assert.equal(branchToSlug('---'), null);
  assert.equal(branchToSlug(''), null);
  assert.equal(branchToSlug(null), null);
});

// --- nome do app --------------------------------------------------------------

test('previewAppName deixa óbvio que é efêmero', () => {
  // `pm2 list`, `docker ps` e `ls ~/apps` precisam mostrar na cara o que é preview.
  assert.equal(previewAppName('meu-app', 'feat-login'), 'preview-meu-app-feat-login');
});

test('previewAppName respeita o padrão de nome de app', () => {
  const nome = previewAppName('app', 'a'.repeat(120))!;
  assert.ok(nome.length <= 100);
  assert.match(nome, /^[a-z0-9][a-z0-9-]*$/);
  assert.ok(!nome.endsWith('-'));
});

// --- domínio ------------------------------------------------------------------

test('previewDomain prefixa o slug no domínio do pai', () => {
  assert.equal(previewDomain('meu-app.exemplo.com', 'feat-login'), 'feat-login.meu-app.exemplo.com');
});

test('previewDomain exige domínio no pai', () => {
  assert.equal(previewDomain(null, 'feat-x'), null);
  assert.equal(previewDomain('', 'feat-x'), null);
});

test('previewDomain recusa FQDN acima de 253 caracteres', () => {
  assert.equal(previewDomain('a'.repeat(250) + '.com', 'feat-x'), null);
});

// --- padrão de branch ---------------------------------------------------------

test('branchMatchesPattern aceita curinga e lista', () => {
  assert.equal(branchMatchesPattern('feat/login', 'feat/*'), true);
  assert.equal(branchMatchesPattern('fix/bug', 'feat/*,fix/*'), true);
  assert.equal(branchMatchesPattern('chore/deps', 'feat/*,fix/*'), false);
  assert.equal(branchMatchesPattern('preview-x', 'preview-*'), true);
});

test('padrão vazio NÃO casa com nada', () => {
  // Preview não pode começar a acontecer sozinho só porque alguém fez push.
  assert.equal(branchMatchesPattern('feat/login', ''), false);
  assert.equal(branchMatchesPattern('feat/login', null), false);
  assert.equal(branchMatchesPattern('main', undefined), false);
});

test('padrão sem curinga exige igualdade', () => {
  assert.equal(branchMatchesPattern('develop', 'develop'), true);
  assert.equal(branchMatchesPattern('develop-2', 'develop'), false);
});

test('ponto no padrão não vira curinga de regex', () => {
  assert.equal(branchMatchesPattern('featXlogin', 'feat.login'), false);
  assert.equal(branchMatchesPattern('feat.login', 'feat.login'), true);
});

// --- portas -------------------------------------------------------------------

test('parsePortRange lê a faixa configurada', () => {
  assert.deepEqual(parsePortRange('21000-21999'), { start: 21000, end: 21999 });
  assert.deepEqual(parsePortRange(' 30000 - 30100 '), { start: 30000, end: 30100 });
});

test('parsePortRange cai no default para valor inútil ou perigoso', () => {
  const padrao = { start: 21000, end: 21999 };
  for (const ruim of [null, '', 'abc', '100-200', '21000', '21999-21000', '1000-70000']) {
    assert.deepEqual(parsePortRange(ruim as any), padrao, String(ruim));
  }
});

test('allocatePort pega a primeira livre da faixa', () => {
  const faixa = { start: 21000, end: 21005 };
  assert.equal(allocatePort(faixa, []), 21000);
  assert.equal(allocatePort(faixa, [21000, 21001]), 21002);
  assert.equal(allocatePort(faixa, [21001]), 21000);
});

test('allocatePort NUNCA sai da faixa reservada', () => {
  // É isto que impede um preview de pegar a porta de um app de produção.
  const faixa = { start: 21000, end: 21002 };
  assert.equal(allocatePort(faixa, [21000, 21001, 21002]), null, 'faixa cheia devolve null');
});

test('allocatePort ignora portas usadas fora da faixa', () => {
  assert.equal(allocatePort({ start: 21000, end: 21002 }, [3000, 8080]), 21000);
});

// --- TTL ----------------------------------------------------------------------

test('expiredPreviews acha o que ficou parado', () => {
  // O gatilho de delete de branch pode nunca vir; sem TTL, preview fica para sempre.
  const agora = new Date('2026-09-20T12:00:00Z');
  const dias = (n: number) => new Date(agora.getTime() - n * 86_400_000);

  const vencidos = expiredPreviews(
    [
      { name: 'novo', updatedAt: dias(1) },
      { name: 'limite', updatedAt: dias(6) },
      { name: 'velho', updatedAt: dias(10) },
    ],
    7,
    agora,
  );
  assert.deepEqual(vencidos.map((p) => p.name), ['velho']);
});

test('TTL zero ou inválido desliga a expiração', () => {
  const previews = [{ name: 'x', updatedAt: new Date('2000-01-01') }];
  assert.deepEqual(expiredPreviews(previews, 0), []);
  assert.deepEqual(expiredPreviews(previews, -1), []);
  assert.deepEqual(expiredPreviews(previews, NaN), []);
});
