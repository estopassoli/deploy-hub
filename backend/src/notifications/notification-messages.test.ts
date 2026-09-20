import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EVENT_META,
  buildDiscordPayload,
  buildSlackPayload,
  buildTelegramPayload,
  escapeTelegramMarkdown,
  plainText,
  telegramApiUrl,
  truncate,
} from './notification-messages.ts';

const deployFalhou = {
  event: 'deploy-failed' as const,
  subject: 'minha-api',
  detail: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
  url: 'https://painel.exemplo.com/apps/abc',
};

test('todo evento tem meta completa', () => {
  for (const [nome, meta] of Object.entries(EVENT_META)) {
    assert.ok(meta.emoji, nome);
    assert.ok(meta.title('x').includes('x'), nome);
    assert.ok(['success', 'warning', 'error'].includes(meta.severity), nome);
    assert.ok(meta.settingKey.startsWith('notify'), nome);
  }
});

test('plainText junta título, detalhe e link', () => {
  const texto = plainText(deployFalhou);
  assert.match(texto, /Deploy falhou: minha-api/);
  assert.match(texto, /ECONNREFUSED/);
  assert.match(texto, /painel\.exemplo\.com/);
});

test('plainText funciona sem detalhe e sem link', () => {
  const texto = plainText({ event: 'app-down', subject: 'api' });
  assert.equal(texto.split('\n').length, 1);
  assert.match(texto, /fora do ar: api/);
});

// --- Slack --------------------------------------------------------------------

test('Slack manda blocks e também o text de fallback', () => {
  // O `text` é o que aparece na notificação do celular, que não renderiza blocks.
  const payload = buildSlackPayload(deployFalhou) as any;
  assert.ok(Array.isArray(payload.blocks));
  assert.ok(payload.text.includes('minha-api'));
  assert.match(JSON.stringify(payload.blocks), /ECONNREFUSED/);
  assert.match(JSON.stringify(payload.blocks), /Abrir no DeployHub/);
});

test('Slack sem detalhe nem link tem só o bloco do título', () => {
  const payload = buildSlackPayload({ event: 'app-down', subject: 'api' }) as any;
  assert.equal(payload.blocks.length, 1);
});

// --- Discord ------------------------------------------------------------------

test('Discord usa embed com cor por severidade', () => {
  const erro = buildDiscordPayload(deployFalhou) as any;
  const sucesso = buildDiscordPayload({ event: 'deploy-success', subject: 'api' }) as any;
  const aviso = buildDiscordPayload({ event: 'ssl-expiring', subject: 'api.x.com' }) as any;

  assert.notEqual(erro.embeds[0].color, sucesso.embeds[0].color);
  assert.notEqual(aviso.embeds[0].color, erro.embeds[0].color);
  assert.match(erro.embeds[0].title, /Deploy falhou/);
  assert.equal(erro.embeds[0].url, deployFalhou.url);
});

// --- Telegram -----------------------------------------------------------------

test('escapeTelegramMarkdown escapa o que quebraria o parse', () => {
  // Um stack trace tem _, -, . e ( ) em toda linha. Sem escape, a API responde
  // "can't parse entities" e a notificação some sem deixar rastro.
  const escapado = escapeTelegramMarkdown('Error: foo_bar (v1.2-beta) [x]!');
  for (const char of ['_', '(', ')', '.', '-', '[', ']', '!']) {
    assert.ok(escapado.includes(`\\${char}`), `faltou escapar ${char}`);
  }
});

test('Telegram monta o corpo com chat_id e MarkdownV2', () => {
  const payload = buildTelegramPayload(deployFalhou, '-1001234') as any;
  assert.equal(payload.chat_id, '-1001234');
  assert.equal(payload.parse_mode, 'MarkdownV2');
  assert.equal(payload.disable_web_page_preview, true);
  assert.match(payload.text, /minha\\-api/, 'o hífen do nome precisa estar escapado');
});

test('telegramApiUrl monta a URL do bot', () => {
  assert.equal(telegramApiUrl('123:ABC'), 'https://api.telegram.org/bot123:ABC/sendMessage');
});

// --- truncate -----------------------------------------------------------------

test('truncate preserva o FIM do texto', () => {
  // A causa de um erro está nas últimas linhas do stack trace, não nas primeiras.
  const longo = 'início'.padEnd(500, 'x') + 'CAUSA_REAL';
  const cortado = truncate(longo, 50);
  assert.equal(cortado.length, 50);
  assert.ok(cortado.endsWith('CAUSA_REAL'));
  assert.ok(cortado.startsWith('...'));
});

test('truncate devolve o texto intacto quando cabe', () => {
  assert.equal(truncate('curto', 50), 'curto');
});
