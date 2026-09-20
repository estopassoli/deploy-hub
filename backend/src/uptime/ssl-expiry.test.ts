import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SSL_ALERT_DAYS,
  daysUntil,
  describeSslExpiry,
  isUpStatus,
  shouldAlertDown,
  shouldAlertSsl,
  sslStatus,
  uptimePercentage,
} from './ssl-expiry.ts';

const AGORA = new Date('2026-09-20T12:00:00Z');
const emDias = (dias: number) => new Date(AGORA.getTime() + dias * 86_400_000);

test('daysUntil conta dias inteiros e aceita data negativa', () => {
  assert.equal(daysUntil(emDias(30), AGORA), 30);
  assert.equal(daysUntil(emDias(1), AGORA), 1);
  assert.equal(daysUntil(emDias(-3), AGORA), -3);
});

test('daysUntil arredonda para baixo', () => {
  // Faltando 1,9 dia o número certo para um alerta é 1, não 2.
  const quase2 = new Date(AGORA.getTime() + 1.9 * 86_400_000);
  assert.equal(daysUntil(quase2, AGORA), 1);
});

test('daysUntil devolve null para valor ausente ou inválido', () => {
  assert.equal(daysUntil(null, AGORA), null);
  assert.equal(daysUntil(undefined, AGORA), null);
  assert.equal(daysUntil('não é data', AGORA), null);
});

test('sslStatus classifica nas quatro faixas', () => {
  assert.equal(sslStatus(emDias(60), AGORA), 'ok');
  assert.equal(sslStatus(emDias(SSL_ALERT_DAYS + 1), AGORA), 'ok');
  assert.equal(sslStatus(emDias(SSL_ALERT_DAYS), AGORA), 'expiring');
  assert.equal(sslStatus(emDias(1), AGORA), 'expiring');
  assert.equal(sslStatus(emDias(-1), AGORA), 'expired');
  assert.equal(sslStatus(null, AGORA), 'unknown');
});

// --- anti-spam do alerta ------------------------------------------------------

test('alerta de SSL na primeira leitura dentro da faixa', () => {
  assert.equal(shouldAlertSsl(null, emDias(10), AGORA), true);
});

test('alerta quando o certificado ENTRA na faixa', () => {
  assert.equal(shouldAlertSsl(emDias(30), emDias(10), AGORA), true);
});

test('NÃO repete o alerta enquanto segue na mesma faixa', () => {
  // Sem isto, o cron diário mandaria a mesma mensagem por catorze dias e as pessoas
  // passariam a ignorar o canal — justamente o canal que precisa ser levado a sério.
  assert.equal(shouldAlertSsl(emDias(10), emDias(9), AGORA), false);
  assert.equal(shouldAlertSsl(emDias(5), emDias(4), AGORA), false);
});

test('alerta de novo quando passa de expirando para expirado', () => {
  assert.equal(shouldAlertSsl(emDias(1), emDias(-1), AGORA), true);
});

test('não alerta quando o certificado está longe do vencimento', () => {
  assert.equal(shouldAlertSsl(emDias(90), emDias(60), AGORA), false);
  assert.equal(shouldAlertSsl(null, emDias(60), AGORA), false);
});

test('não repete depois de já ter avisado que venceu', () => {
  assert.equal(shouldAlertSsl(emDias(-1), emDias(-2), AGORA), false);
});

test('describeSslExpiry escreve o prazo em português', () => {
  assert.match(describeSslExpiry('api.x.com', emDias(10), AGORA), /vence em 10 dia/);
  assert.match(describeSslExpiry('api.x.com', emDias(0), AGORA), /vence hoje/);
  assert.match(describeSslExpiry('api.x.com', emDias(-5), AGORA), /venceu há 5 dia/);
});

// --- uptime -------------------------------------------------------------------

test('isUpStatus usa o mesmo critério do health check', () => {
  for (const code of [200, 204, 301, 401, 404, 499]) assert.equal(isUpStatus(code), true, String(code));
  for (const code of [500, 502, 503, 0]) assert.equal(isUpStatus(code), false, String(code));
});

test('shouldAlertDown só dispara na transição up -> down', () => {
  assert.equal(shouldAlertDown('up', 'down'), true);
  assert.equal(shouldAlertDown('down', 'down'), false, 'não repete enquanto segue fora');
  assert.equal(shouldAlertDown(null, 'down'), false, 'primeira leitura não alerta');
  assert.equal(shouldAlertDown('down', 'up'), false);
});

test('uptimePercentage calcula com uma casa decimal', () => {
  assert.equal(uptimePercentage([{ status: 'up' }, { status: 'up' }, { status: 'down' }]), 66.7);
  assert.equal(uptimePercentage([{ status: 'up' }]), 100);
  assert.equal(uptimePercentage([{ status: 'down' }]), 0);
  assert.equal(uptimePercentage([]), null);
});
