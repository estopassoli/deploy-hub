import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnvKeys, sanitizePm2Env } from './pm2-env.ts';

/** O `.env` do painel, no formato que o install.sh gera. */
const DOTENV_DO_PAINEL = `
# DeployHub Backend Environment Variables

# Server
PORT=10001
NODE_ENV=production

# Database (SQLite)
DATABASE_URL="file:./prisma/deployhub.db"

JWT_SECRET=e677f9d4
export APPS_DIR=/root/apps

# RESEND_API_KEY=comentada-nao-conta
CORS_ORIGINS=https://panel.lashexpert.pro
`;

test('parseEnvKeys lê os nomes e ignora comentário, linha vazia e export', () => {
  const keys = parseEnvKeys(DOTENV_DO_PAINEL);

  assert.deepEqual(keys, [
    'PORT',
    'NODE_ENV',
    'DATABASE_URL',
    'JWT_SECRET',
    'APPS_DIR',
    'CORS_ORIGINS',
  ]);
});

test('parseEnvKeys não repete chave declarada duas vezes', () => {
  assert.deepEqual(parseEnvKeys('PORT=1\nPORT=2\n'), ['PORT']);
});

test('sanitizePm2Env remove o que derrubou o agendaexpert', () => {
  // O `process.env` do backend quando ele chama `pm2 startOrReload --update-env`.
  const limpo = sanitizePm2Env(
    {
      PATH: '/usr/bin',
      HOME: '/root',
      DATABASE_URL: 'file:./prisma/deployhub.db',
      PORT: '10001',
    },
    parseEnvKeys(DOTENV_DO_PAINEL),
  );

  assert.equal(limpo.DATABASE_URL, undefined, 'o SQLite do painel não pode vazar para o app');
  assert.equal(limpo.PORT, undefined, 'a porta do painel causava EADDRINUSE no app');
});

test('sanitizePm2Env preserva o que o CLI do pm2 precisa', () => {
  const limpo = sanitizePm2Env({
    PATH: '/usr/bin',
    HOME: '/root',
    USER: 'root',
    LANG: 'C.UTF-8',
    PM2_HOME: '/root/.pm2',
    PM2_USAGE: 'CLI',
  });

  assert.equal(limpo.PATH, '/usr/bin');
  assert.equal(limpo.HOME, '/root');
  assert.equal(limpo.USER, 'root');
  assert.equal(limpo.LANG, 'C.UTF-8');
  assert.equal(limpo.PM2_HOME, '/root/.pm2', 'sem PM2_HOME o CLI não acha o daemon');
  assert.equal(limpo.PM2_USAGE, 'CLI');
});

test('sanitizePm2Env aplica o piso fixo sem precisar do .env', () => {
  const limpo = sanitizePm2Env({ DATABASE_URL: 'file:./prisma/deployhub.db', PORT: '10001', PATH: '/usr/bin' });

  assert.equal(limpo.DATABASE_URL, undefined);
  assert.equal(limpo.PORT, undefined);
  assert.equal(limpo.PATH, '/usr/bin');
});

test('sanitizePm2Env descarta a escrituração que o PM2 injeta', () => {
  const limpo = sanitizePm2Env({
    PATH: '/usr/bin',
    pm_id: '1',
    pm_exec_path: '/root/deployhub/backend/dist/main.js',
    axm_options: '[object Object]',
    unique_id: '477bcc5d',
    exec_mode: 'fork_mode',
    name: 'deployhub-backend',
    NODE_APP_INSTANCE: '0',
  });

  assert.deepEqual(Object.keys(limpo), ['PATH'], 'o app novo não herda a descrição do processo do painel');
});

test('sanitizePm2Env não altera o objeto de origem', () => {
  const origem = { DATABASE_URL: 'file:./prisma/deployhub.db', PATH: '/usr/bin' };
  sanitizePm2Env(origem);

  assert.equal(origem.DATABASE_URL, 'file:./prisma/deployhub.db');
});
