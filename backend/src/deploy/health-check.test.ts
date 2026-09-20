import { createServer } from 'node:http';
import type { Server } from 'node:http';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthUrl, isHealthyStatus, normalizeHealthPath, waitForHealthy } from './health-check.ts';

/** Sobe um servidor HTTP real numa porta livre e devolve a porta. */
async function serve(handler: (req: any, res: any) => void): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Sleep instantâneo: o teste não espera 3s por tentativa. */
const noSleep = async () => {};

// --- helpers puros ------------------------------------------------------------

test('normalizeHealthPath garante a barra inicial', () => {
  assert.equal(normalizeHealthPath(null), '/');
  assert.equal(normalizeHealthPath(undefined), '/');
  assert.equal(normalizeHealthPath(''), '/');
  assert.equal(normalizeHealthPath('   '), '/');
  assert.equal(normalizeHealthPath('/health'), '/health');
  assert.equal(normalizeHealthPath('health'), '/health');
  assert.equal(normalizeHealthPath('api/health'), '/api/health');
});

test('healthUrl aponta sempre para 127.0.0.1', () => {
  // O alvo é o processo local, não o domínio público: checar o domínio testaria
  // nginx, DNS e TLS junto, e daria falso negativo antes do certificado existir.
  assert.equal(healthUrl(3000, '/health'), 'http://127.0.0.1:3000/health');
  assert.equal(healthUrl(8080, null), 'http://127.0.0.1:8080/');
});

test('isHealthyStatus aceita tudo abaixo de 500', () => {
  // Permissivo de propósito: 404 numa rota que o app não define e 401 numa API que
  // exige token significam "está de pé e respondendo".
  for (const status of [200, 204, 301, 302, 401, 404, 418, 499]) {
    assert.equal(isHealthyStatus(status), true, String(status));
  }
  for (const status of [500, 502, 503, 0, -1, NaN]) {
    assert.equal(isHealthyStatus(status), false, String(status));
  }
});

// --- contra um servidor de verdade -------------------------------------------

test('app respondendo 200 é saudável na primeira tentativa', async () => {
  const s = await serve((_req, res) => { res.statusCode = 200; res.end('ok'); });
  try {
    const result = await waitForHealthy({ port: s.port, sleep: noSleep });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
    assert.equal(result.status, 200);
  } finally {
    await s.close();
  }
});

test('404 conta como saudável', async () => {
  const s = await serve((_req, res) => { res.statusCode = 404; res.end('not found'); });
  try {
    const result = await waitForHealthy({ port: s.port, sleep: noSleep });
    assert.equal(result.ok, true, 'o processo está de pé, só não tem essa rota');
  } finally {
    await s.close();
  }
});

test('500 NÃO é saudável', async () => {
  // O caso que mais importa: app que sobe mas não conecta no banco.
  const s = await serve((_req, res) => { res.statusCode = 500; res.end('boom'); });
  try {
    const result = await waitForHealthy({ port: s.port, attempts: 3, sleep: noSleep });
    assert.equal(result.ok, false);
    assert.equal(result.attempts, 3);
    assert.match(result.error ?? '', /500/);
  } finally {
    await s.close();
  }
});

test('porta fechada falha depois de esgotar as tentativas', async () => {
  const s = await serve((_req, res) => res.end());
  const port = s.port;
  await s.close();

  const result = await waitForHealthy({ port, attempts: 3, sleep: noSleep });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 3);
});

test('app que demora a subir passa numa tentativa posterior', async () => {
  // É o caso normal: o PM2 retorna antes de o app aceitar conexão.
  let chamadas = 0;
  const s = await serve((_req, res) => {
    chamadas++;
    if (chamadas < 3) { res.statusCode = 503; res.end('subindo'); return; }
    res.statusCode = 200; res.end('ok');
  });
  try {
    const result = await waitForHealthy({ port: s.port, attempts: 5, sleep: noSleep });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 3);
  } finally {
    await s.close();
  }
});

test('respeita o healthPath configurado', async () => {
  const caminhos: string[] = [];
  const s = await serve((req, res) => { caminhos.push(req.url); res.statusCode = 200; res.end('ok'); });
  try {
    await waitForHealthy({ port: s.port, path: '/api/health', sleep: noSleep });
    assert.deepEqual(caminhos, ['/api/health']);
  } finally {
    await s.close();
  }
});

test('onAttempt recebe o progresso para o log do deploy', async () => {
  const s = await serve((_req, res) => { res.statusCode = 500; res.end(); });
  try {
    const tentativas: string[] = [];
    await waitForHealthy({
      port: s.port,
      attempts: 2,
      sleep: noSleep,
      onAttempt: (n, total, detalhe) => tentativas.push(`${n}/${total} ${detalhe}`),
    });
    assert.equal(tentativas.length, 2);
    assert.match(tentativas[0], /1\/2 HTTP 500/);
  } finally {
    await s.close();
  }
});

test('para imediatamente quando o deploy é cancelado', async () => {
  const s = await serve((_req, res) => { res.statusCode = 500; res.end(); });
  try {
    const result = await waitForHealthy({
      port: s.port,
      attempts: 10,
      sleep: noSleep,
      isCancelled: () => true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'cancelado');
    assert.equal(result.attempts, 0);
  } finally {
    await s.close();
  }
});

test('timeout de uma tentativa não trava o deploy', async () => {
  // Servidor que aceita a conexão e nunca responde.
  const s = await serve(() => { /* silêncio */ });
  try {
    const result = await waitForHealthy({ port: s.port, attempts: 1, timeoutMs: 150, sleep: noSleep });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /timeout/);
  } finally {
    await s.close();
  }
});
