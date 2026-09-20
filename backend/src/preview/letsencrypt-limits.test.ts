import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WARN_THRESHOLD,
  WEEKLY_CERT_LIMIT,
  consumesQuota,
  countInWindow,
  describeQuota,
  quotaStatus,
  registeredDomain,
} from './letsencrypt-limits.ts';

const AGORA = new Date('2026-09-20T12:00:00Z');
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);

// --- domínio registrado -------------------------------------------------------

test('registeredDomain reduz ao eTLD+1', () => {
  // O limite do Let's Encrypt é por domínio registrado, não por hostname: todos os
  // subdomínios dividem a mesma cota.
  assert.equal(registeredDomain('api.exemplo.com'), 'exemplo.com');
  assert.equal(registeredDomain('feat-login.meu-app.exemplo.com'), 'exemplo.com');
  assert.equal(registeredDomain('exemplo.com'), 'exemplo.com');
});

test('registeredDomain entende sufixos de duas partes', () => {
  assert.equal(registeredDomain('api.exemplo.com.br'), 'exemplo.com.br');
  assert.equal(registeredDomain('feat-x.app.exemplo.com.br'), 'exemplo.com.br');
  assert.equal(registeredDomain('exemplo.com.br'), 'exemplo.com.br');
  assert.equal(registeredDomain('site.co.uk'), 'site.co.uk');
});

test('registeredDomain normaliza caixa e ponto final', () => {
  assert.equal(registeredDomain('API.Exemplo.COM.'), 'exemplo.com');
  assert.equal(registeredDomain(''), '');
});

// --- contagem na janela -------------------------------------------------------

test('countInWindow soma só o que está dentro dos 7 dias', () => {
  const emissoes = [
    { domain: 'a.exemplo.com', issuedAt: diasAtras(1) },
    { domain: 'b.exemplo.com', issuedAt: diasAtras(6) },
    { domain: 'c.exemplo.com', issuedAt: diasAtras(8) }, // fora da janela
  ];
  assert.equal(countInWindow(emissoes, 'novo.exemplo.com', AGORA), 2);
});

test('countInWindow separa domínios registrados diferentes', () => {
  const emissoes = [
    { domain: 'a.exemplo.com', issuedAt: diasAtras(1) },
    { domain: 'b.outrodominio.com', issuedAt: diasAtras(1) },
  ];
  assert.equal(countInWindow(emissoes, 'novo.exemplo.com', AGORA), 1);
  assert.equal(countInWindow(emissoes, 'novo.outrodominio.com', AGORA), 1);
});

test('countInWindow agrupa subdomínios sob o mesmo domínio registrado', () => {
  // É o caso do preview: feat-a.app.exemplo.com e feat-b.app.exemplo.com competem
  // pela mesma cota de exemplo.com.
  const emissoes = [
    { domain: 'feat-a.app.exemplo.com', issuedAt: diasAtras(1) },
    { domain: 'feat-b.app.exemplo.com', issuedAt: diasAtras(2) },
    { domain: 'producao.exemplo.com', issuedAt: diasAtras(3) },
  ];
  assert.equal(countInWindow(emissoes, 'feat-c.app.exemplo.com', AGORA), 3);
});

// --- status da cota -----------------------------------------------------------

function emissoes(quantidade: number, dias = 1) {
  return Array.from({ length: quantidade }, (_, i) => ({
    domain: `p${i}.exemplo.com`,
    issuedAt: diasAtras(dias),
  }));
}

test('quotaStatus classifica ok, warning e exhausted', () => {
  assert.equal(quotaStatus(emissoes(10), 'x.exemplo.com', AGORA).level, 'ok');
  assert.equal(quotaStatus(emissoes(WARN_THRESHOLD), 'x.exemplo.com', AGORA).level, 'warning');
  assert.equal(quotaStatus(emissoes(WEEKLY_CERT_LIMIT), 'x.exemplo.com', AGORA).level, 'exhausted');
  assert.equal(quotaStatus(emissoes(WEEKLY_CERT_LIMIT + 5), 'x.exemplo.com', AGORA).level, 'exhausted');
});

test('quotaStatus calcula quantas emissões ainda cabem', () => {
  const status = quotaStatus(emissoes(45), 'x.exemplo.com', AGORA);
  assert.equal(status.used, 45);
  assert.equal(status.remaining, 5);
});

test('remaining nunca fica negativo', () => {
  assert.equal(quotaStatus(emissoes(60), 'x.exemplo.com', AGORA).remaining, 0);
});

test('resetsAt aponta quando a emissão mais antiga sai da janela', () => {
  const status = quotaStatus(
    [
      { domain: 'a.exemplo.com', issuedAt: diasAtras(6) },
      { domain: 'b.exemplo.com', issuedAt: diasAtras(1) },
    ],
    'x.exemplo.com',
    AGORA,
  );
  // A mais antiga tem 6 dias; a vaga abre daqui a 1 dia.
  const esperado = new Date(diasAtras(6).getTime() + 7 * 86_400_000);
  assert.equal(status.resetsAt?.getTime(), esperado.getTime());
});

test('sem emissões, não há data de reset', () => {
  const status = quotaStatus([], 'x.exemplo.com', AGORA);
  assert.equal(status.resetsAt, null);
  assert.equal(status.used, 0);
  assert.equal(status.remaining, WEEKLY_CERT_LIMIT);
});

// --- renovação não consome cota ----------------------------------------------

test('renovação não conta no limite de 50', () => {
  // O Let's Encrypt trata reemissão para um conjunto de nomes já certificado como
  // renovação, fora do limite por domínio registrado. Sem essa distinção, um servidor
  // com renovações frequentes pareceria estourado sem estar.
  assert.equal(consumesQuota(false), true, 'domínio novo consome');
  assert.equal(consumesQuota(true), false, 'já tem certificado: é renovação');
});

// --- mensagem -----------------------------------------------------------------

test('describeQuota avisa com clareza que produção também é afetada', () => {
  const msg = describeQuota(quotaStatus(emissoes(WEEKLY_CERT_LIMIT), 'x.exemplo.com', AGORA));
  assert.match(msg, /esgotada/);
  assert.match(msg, /50\/50/);
  assert.match(msg, /produção/, 'precisa deixar claro que não fica contido no preview');
  assert.match(msg, /próxima vaga abre/);
});

test('describeQuota mostra quantas restam no aviso', () => {
  const msg = describeQuota(quotaStatus(emissoes(42), 'x.exemplo.com', AGORA));
  assert.match(msg, /42\/50/);
  assert.match(msg, /restam 8/);
});
