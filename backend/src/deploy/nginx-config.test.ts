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

test('proxy without domain never emits 443 even if hasCert', () => {
  const c = proxyVhostConfig({ domain: null, port: 4000, hasCert: true });
  assert.ok(c.includes('server_name _;'));
  assert.ok(!c.includes('listen 443'));
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
