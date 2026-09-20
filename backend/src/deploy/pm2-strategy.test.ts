import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decidePm2Strategy, extractIdentity } from './pm2-strategy.ts';

/** Formato que generatePM2Config emite. */
function ecosystem(o: { name?: string; script?: string; args?: string; cwd?: string; interpreter?: string; env?: string }) {
  return `
module.exports = {
  apps: [{
    name: '${o.name ?? 'meu-app'}',
    cwd: ${o.cwd ?? '"/root/apps/meu-app/current"'},
    script: ${o.script ?? '"npm"'},
    args: '${o.args ?? 'run start'}',
    interpreter: '${o.interpreter ?? 'none'}',
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      ${o.env ?? "DATABASE_URL: 'a'"}
    }
  }]
};
`;
}

test('extractIdentity lê os campos que definem o processo', () => {
  const identity = extractIdentity(ecosystem({ name: 'api', script: '"node"', args: 'dist/main.js' }));
  assert.equal(identity.name, "'api'");
  assert.equal(identity.script, '"node"');
  assert.equal(identity.args, "'dist/main.js'");
});

test('extractIdentity devolve vazio para entrada inútil', () => {
  assert.deepEqual(extractIdentity(null), {});
  assert.deepEqual(extractIdentity(''), {});
  assert.deepEqual(extractIdentity('não é um ecosystem'), {});
});

test('reload quando só o env mudou', () => {
  // O caso comum: redeploy do mesmo app, mesma config, valores de env novos.
  const estrategia = decidePm2Strategy({
    processExists: true,
    previousRuntime: 'pm2',
    previousConfig: ecosystem({ env: "DATABASE_URL: 'antigo'" }),
    nextConfig: ecosystem({ env: "DATABASE_URL: 'novo'" }),
  });
  assert.equal(estrategia, 'reload');
});

test('recreate quando o script muda', () => {
  const estrategia = decidePm2Strategy({
    processExists: true,
    previousRuntime: 'pm2',
    previousConfig: ecosystem({ script: '"npm"' }),
    nextConfig: ecosystem({ script: 'nextBin' }),
  });
  assert.equal(estrategia, 'recreate');
});

test('recreate quando o cwd muda (appDir do monorepo alterado)', () => {
  const estrategia = decidePm2Strategy({
    processExists: true,
    previousRuntime: 'pm2',
    previousConfig: ecosystem({ cwd: '"/root/apps/p/current/apps/api"' }),
    nextConfig: ecosystem({ cwd: '"/root/apps/p/current/apps/backend"' }),
  });
  assert.equal(estrategia, 'recreate');
});

test('recreate quando não existe processo no PM2', () => {
  const config = ecosystem({});
  assert.equal(
    decidePm2Strategy({ processExists: false, previousRuntime: 'pm2', previousConfig: config, nextConfig: config }),
    'recreate',
  );
});

test('recreate quando o app estava em docker ou estático', () => {
  // Trocar de supervisor exige derrubar o anterior antes de o novo pegar a porta.
  const config = ecosystem({});
  for (const previousRuntime of ['docker', 'static']) {
    assert.equal(
      decidePm2Strategy({ processExists: true, previousRuntime, previousConfig: config, nextConfig: config }),
      'recreate',
      previousRuntime,
    );
  }
});

test('recreate quando não há config anterior no disco', () => {
  assert.equal(
    decidePm2Strategy({ processExists: true, previousRuntime: 'pm2', previousConfig: null, nextConfig: ecosystem({}) }),
    'recreate',
  );
});

test('recreate quando a config anterior é ilegível (lado seguro)', () => {
  assert.equal(
    decidePm2Strategy({
      processExists: true,
      previousRuntime: 'pm2',
      previousConfig: 'arquivo corrompido',
      nextConfig: ecosystem({}),
    }),
    'recreate',
  );
});
