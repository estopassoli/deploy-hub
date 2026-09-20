import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  computeSignature,
  decideWebhookAuth,
  describeSignatureHeader,
  parseAllowUnsigned,
  verifySignature,
} from './webhook-signature.ts';

const SEGREDO = 'segredo-de-teste-0123456789abcdef';
const CORPO = '{"ref":"refs/heads/main"}';

test('computeSignature produz o mesmo formato que o GitHub manda', () => {
  const esperado = 'sha256=' + createHmac('sha256', SEGREDO).update(CORPO).digest('hex');
  assert.equal(computeSignature(SEGREDO, CORPO), esperado);
  assert.match(computeSignature(SEGREDO, CORPO), /^sha256=[0-9a-f]{64}$/);
});

test('computeSignature trata string e Buffer como o mesmo corpo', () => {
  assert.equal(computeSignature(SEGREDO, CORPO), computeSignature(SEGREDO, Buffer.from(CORPO, 'utf8')));
});

test('verifySignature aceita a assinatura correta', () => {
  assert.equal(verifySignature(SEGREDO, computeSignature(SEGREDO, CORPO), CORPO), true);
});

test('verifySignature recusa corpo adulterado', () => {
  const assinatura = computeSignature(SEGREDO, CORPO);
  assert.equal(verifySignature(SEGREDO, assinatura, '{"ref":"refs/heads/producao"}'), false);
});

test('verifySignature recusa segredo errado', () => {
  const assinatura = computeSignature('outro-segredo', CORPO);
  assert.equal(verifySignature(SEGREDO, assinatura, CORPO), false);
});

test('verifySignature recusa header ausente, vazio ou não-string', () => {
  assert.equal(verifySignature(SEGREDO, undefined, CORPO), false);
  assert.equal(verifySignature(SEGREDO, '', CORPO), false);
  assert.equal(verifySignature(SEGREDO, null, CORPO), false);
  assert.equal(verifySignature(SEGREDO, 12345, CORPO), false);
});

test('verifySignature recusa quando não há segredo, em vez de aceitar qualquer coisa', () => {
  assert.equal(verifySignature('', 'sha256=qualquer', CORPO), false);
});

test('verifySignature não lança com header de comprimento diferente', () => {
  // timingSafeEqual puro lançaria aqui; tratar a exceção reintroduziria o vazamento de
  // tempo que este módulo existe para evitar.
  assert.equal(verifySignature(SEGREDO, 'sha256=abc', CORPO), false);
  assert.equal(verifySignature(SEGREDO, 'x'.repeat(500), CORPO), false);
});

test('verifySignature não aceita um prefixo correto da assinatura', () => {
  // Era o vetor da comparação com !==: acertar byte a byte medindo o tempo.
  const assinatura = computeSignature(SEGREDO, CORPO);
  assert.equal(verifySignature(SEGREDO, assinatura.slice(0, -1), CORPO), false);
  assert.equal(verifySignature(SEGREDO, assinatura.slice(0, 20), CORPO), false);
});

test('app com segredo sempre verifica', () => {
  const decisao = decideWebhookAuth({ hasSecret: true, allowUnsigned: false, appName: 'loja' });
  assert.deepEqual(decisao, { action: 'verify' });
});

test('WEBHOOK_ALLOW_UNSIGNED não afeta app que tem segredo', () => {
  const decisao = decideWebhookAuth({ hasSecret: true, allowUnsigned: true, appName: 'loja' });
  assert.deepEqual(decisao, { action: 'verify' });
});

test('app sem segredo é rejeitado por padrão', () => {
  const decisao = decideWebhookAuth({ hasSecret: false, allowUnsigned: false, appName: 'loja' });
  assert.equal(decisao.action, 'reject');
  assert.match((decisao as any).reason, /loja/);
  assert.match((decisao as any).reason, /Gere um segredo/);
});

test('o fallback explícito devolve um aviso que nomeia o risco', () => {
  const decisao = decideWebhookAuth({ hasSecret: false, allowUnsigned: true, appName: 'loja' });
  assert.equal(decisao.action, 'allow-unsigned');
  assert.match((decisao as any).warning, /SEM verificação/);
  assert.match((decisao as any).warning, /WEBHOOK_ALLOW_UNSIGNED/);
});

test('parseAllowUnsigned só liga com valor explícito', () => {
  assert.equal(parseAllowUnsigned('true'), true);
  assert.equal(parseAllowUnsigned('1'), true);
  assert.equal(parseAllowUnsigned('YES'), true);
  assert.equal(parseAllowUnsigned(' on '), true);

  assert.equal(parseAllowUnsigned(''), false);
  assert.equal(parseAllowUnsigned(undefined), false);
  assert.equal(parseAllowUnsigned(null), false);
  assert.equal(parseAllowUnsigned('false'), false);
  assert.equal(parseAllowUnsigned('0'), false);
  // Um valor qualquer não pode ligar um fallback inseguro.
  assert.equal(parseAllowUnsigned('talvez'), false);
});

test('describeSignatureHeader nunca devolve o valor da assinatura', () => {
  const assinatura = computeSignature(SEGREDO, CORPO);
  const descricao = describeSignatureHeader(assinatura);

  assert.equal(descricao, 'presente');
  assert.equal(descricao.includes(assinatura), false);
  // Nenhum pedaço do hex pode vazar na descrição.
  assert.equal(/[0-9a-f]{8}/.test(descricao), false);
});

test('describeSignatureHeader distingue ausente de malformado', () => {
  assert.equal(describeSignatureHeader(undefined), 'ausente');
  assert.equal(describeSignatureHeader(''), 'ausente');
  assert.equal(describeSignatureHeader('sha1=abc'), 'formato inesperado');
});
