import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyVhostConfig, staticVhostConfig } from './nginx-config.ts';

// --- proxy ---
test('proxy without cert is HTTP-only and routes to the port', () => {
  const c = proxyVhostConfig({ domain: 'blurp.com.br', port: 4001, hasCert: false });
  assert.ok(c.includes('listen 80;'));
  assert.ok(c.includes('server_name blurp.com.br;'));
  assert.ok(c.includes('proxy_pass http://127.0.0.1:4001;'));
  assert.ok(!c.includes('listen 443'));
});

test('proxy WITH cert keeps :80 AND adds :443 ssl with the LE cert', () => {
  const c = proxyVhostConfig({ domain: 'blurp.com.br', port: 4001, hasCert: true });
  assert.ok(c.includes('listen 80;'));
  assert.ok(c.includes('listen 443 ssl;'));
  assert.ok(c.includes('ssl_certificate /etc/letsencrypt/live/blurp.com.br/fullchain.pem;'));
  assert.ok(c.includes('ssl_certificate_key /etc/letsencrypt/live/blurp.com.br/privkey.pem;'));
  // both server blocks proxy to the same app port
  assert.equal(c.match(/proxy_pass http:\/\/127\.0\.0\.1:4001;/g)?.length, 2);
});

test('proxy sem domínio não gera vhost nenhum', () => {
  // `server_name _` não casa com Host nenhum: o domínio real caía no default_server
  // (o catch-all), que fecha a conexão, enquanto o deploy reportava sucesso. Derrubou
  // o agendaexpert em 23/09/2026 — Cloudflare 520 com os apps respondendo 200 local.
  assert.equal(proxyVhostConfig({ domain: null, port: 4000, hasCert: true }), '');
  assert.equal(proxyVhostConfig({ domain: '', port: 4000, hasCert: false }), '');
  assert.equal(proxyVhostConfig({ port: 4000 }), '');
});

test('static sem domínio não gera vhost nenhum', () => {
  assert.equal(staticVhostConfig({ domain: null, appName: 'blurp', hasCert: true }), '');
  assert.equal(staticVhostConfig({ appName: 'blurp' }), '');
});

test('com domínio o vhost continua saindo normal', () => {
  const c = proxyVhostConfig({ domain: 'app.blurp.com.br', port: 4000, hasCert: false });
  assert.ok(c.includes('server_name app.blurp.com.br;'));
  assert.ok(c.includes('proxy_pass http://127.0.0.1:4000;'));
  assert.ok(!c.includes('server_name _;'));
});

// --- static ---
test('static without cert is HTTP-only and serves /var/www', () => {
  const c = staticVhostConfig({ domain: 'app.blurp.com.br', appName: 'blurp-admin', hasCert: false });
  assert.ok(c.includes('listen 80;'));
  assert.ok(c.includes('root /var/www/blurp-admin;'));
  assert.ok(!c.includes('listen 443'));
});

test('static WITH cert keeps :80 AND adds :443 ssl', () => {
  const c = staticVhostConfig({ domain: 'app.blurp.com.br', appName: 'blurp-admin', hasCert: true });
  assert.ok(c.includes('listen 443 ssl;'));
  assert.ok(c.includes('ssl_certificate /etc/letsencrypt/live/app.blurp.com.br/fullchain.pem;'));
  assert.equal(c.match(/root \/var\/www\/blurp-admin;/g)?.length, 2);
});
