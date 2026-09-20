import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UpdateEmailSettingsDto, normalizeBoolean, normalizeRecipient } from './system.dto.ts';

/** Mesmas opções do ValidationPipe global de main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

function run(body: unknown): Promise<any> {
  return pipe.transform(body, { type: 'body', metatype: UpdateEmailSettingsDto, data: '' } as any);
}

async function expectRejection(body: unknown): Promise<string> {
  try {
    await run(body);
  } catch (error: any) {
    return JSON.stringify(error?.response ?? error?.message ?? error);
  }
  assert.fail('esperava que o ValidationPipe rejeitasse o body');
}

test('aceita o que o painel envia hoje', async () => {
  const comEmail = await run({ emailEnabled: true, emailRecipient: 'ops@exemplo.com' });
  assert.equal(comEmail.emailEnabled, true);
  assert.equal(comEmail.emailRecipient, 'ops@exemplo.com');

  const semEmail = await run({ emailEnabled: false });
  assert.equal(semEmail.emailEnabled, false);
});

test('trata destinatário vazio como ausente, não como email inválido', async () => {
  const result = await run({ emailEnabled: false, emailRecipient: '' });
  assert.equal(result.emailRecipient, null);
});

test('rejeita destinatário que não é email', async () => {
  // Este valor vira o campo `to:` de uma chamada à API do Resend.
  const message = await expectRejection({ emailEnabled: true, emailRecipient: 'não-é-email' });
  assert.match(message, /emailRecipient/);
});

test('rejeita emailEnabled não booleano e campo desconhecido', async () => {
  assert.match(await expectRejection({ emailEnabled: 'talvez' }), /emailEnabled/);
  assert.match(await expectRejection({ emailEnabled: true, slackWebhook: 'x' }), /slackWebhook/);
});

test('normalizeBoolean aceita as strings de formulário', () => {
  assert.equal(normalizeBoolean('true'), true);
  assert.equal(normalizeBoolean('false'), false);
  assert.equal(normalizeBoolean(true), true);
  assert.equal(normalizeBoolean('talvez'), 'talvez');
});

test('normalizeRecipient normaliza vazio para null', () => {
  assert.equal(normalizeRecipient(''), null);
  assert.equal(normalizeRecipient('   '), null);
  assert.equal(normalizeRecipient(null), null);
  assert.equal(normalizeRecipient(undefined), null);
  assert.equal(normalizeRecipient('ops@exemplo.com'), 'ops@exemplo.com');
});
