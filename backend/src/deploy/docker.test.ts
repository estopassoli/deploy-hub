import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  detectDockerAssets,
  resolveRuntime,
  imageTag,
  containerName,
  composeProject,
  parseExposedPort,
  buildImageCmd,
  runContainerCmd,
  runOnceCmd,
  composeUpCmd,
  composeDownCmd,
  renderEnvFile,
  parseMemUsage,
  parseCpuPerc,
  shq,
  type DockerAssets,
} from './docker.ts';

function tmp(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dockertest-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const none: DockerAssets = { composeFile: null, dockerfile: null };

// --- detectDockerAssets ---
test('detectDockerAssets finds Dockerfile and compose in the app dir', () => {
  const root = tmp({ 'apps/api/Dockerfile': 'FROM node', 'apps/api/compose.yml': 'services: {}' });
  const assets = detectDockerAssets(path.join(root, 'apps/api'), root);
  assert.equal(assets.dockerfile, path.join(root, 'apps/api/Dockerfile'));
  assert.equal(assets.composeFile, path.join(root, 'apps/api/compose.yml'));
});

test('detectDockerAssets falls back to a repo-root Dockerfile', () => {
  const root = tmp({ 'Dockerfile': 'FROM node', 'apps/api/package.json': '{}' });
  const assets = detectDockerAssets(path.join(root, 'apps/api'), root);
  assert.equal(assets.dockerfile, path.join(root, 'Dockerfile'));
});

test('detectDockerAssets ignores a repo-root compose for a monorepo service', () => {
  // A root compose usually describes every service; bringing it up from one service
  // would start and stop its siblings behind their backs.
  const root = tmp({ 'docker-compose.yml': 'services: {}', 'apps/api/package.json': '{}' });
  assert.equal(detectDockerAssets(path.join(root, 'apps/api'), root).composeFile, null);
});

test('detectDockerAssets finds a root compose for a single-app deploy', () => {
  const root = tmp({ 'docker-compose.yml': 'services: {}' });
  assert.equal(detectDockerAssets(root, root).composeFile, path.join(root, 'docker-compose.yml'));
});

test('detectDockerAssets prefers compose.yaml over docker-compose.yml', () => {
  const root = tmp({ 'compose.yaml': 'a', 'docker-compose.yml': 'b' });
  assert.equal(detectDockerAssets(root, root).composeFile, path.join(root, 'compose.yaml'));
});

test('detectDockerAssets returns nulls when nothing is there', () => {
  assert.deepEqual(detectDockerAssets(tmp({ 'package.json': '{}' }), '/nope'), none);
});

// --- resolveRuntime ---
test('resolveRuntime auto picks docker only when files exist', () => {
  assert.equal(resolveRuntime('auto', { composeFile: '/x/compose.yml', dockerfile: null }), 'docker');
  assert.equal(resolveRuntime('auto', { composeFile: null, dockerfile: '/x/Dockerfile' }), 'docker');
  assert.equal(resolveRuntime('auto', none), 'pm2');
});

test('resolveRuntime null/undefined behaves as auto', () => {
  assert.equal(resolveRuntime(null, { composeFile: null, dockerfile: '/x/Dockerfile' }), 'docker');
  assert.equal(resolveRuntime(undefined, none), 'pm2');
});

test('resolveRuntime pm2 wins over present Docker files', () => {
  assert.equal(resolveRuntime('pm2', { composeFile: '/x/compose.yml', dockerfile: '/x/Dockerfile' }), 'pm2');
});

test('resolveRuntime honours the caller fallback for static apps', () => {
  assert.equal(resolveRuntime('pm2', none, 'static'), 'static');
  assert.equal(resolveRuntime('auto', none, 'static'), 'static');
});

test('resolveRuntime docker without Docker files throws instead of falling back', () => {
  assert.throws(() => resolveRuntime('docker', none), /Dockerfile/);
});

// --- naming ---
test('imageTag / containerName', () => {
  assert.equal(imageTag('educators-api', '2026-08-11_02-29-06'), 'deployhub/educators-api:2026-08-11_02-29-06');
  assert.equal(containerName('educators-api'), 'educators-api');
});

test('composeProject sanitises to what compose accepts', () => {
  assert.equal(composeProject('educators-api'), 'educators-api');
  assert.equal(composeProject('Blurp_Frontend'), 'blurp_frontend');
  assert.equal(composeProject('__weird.name!'), 'weird-name-');
});

// --- parseExposedPort ---
test('parseExposedPort reads the first EXPOSE', () => {
  assert.equal(parseExposedPort('FROM node\nEXPOSE 8080\nCMD ["node"]'), 8080);
  assert.equal(parseExposedPort('EXPOSE 3000/tcp'), 3000);
  assert.equal(parseExposedPort('expose  5000 6000'), 5000);
  assert.equal(parseExposedPort('FROM node\nEXPOSE 3000\nEXPOSE 9000'), 3000);
});

test('parseExposedPort returns null when absent or bogus', () => {
  assert.equal(parseExposedPort('FROM node\nCMD ["node"]'), null);
  assert.equal(parseExposedPort('EXPOSE 99999'), null);
  assert.equal(parseExposedPort('EXPOSE $PORT'), null);
});

// --- command builders ---
test('buildImageCmd quotes paths and adds the moving tag', () => {
  assert.equal(
    buildImageCmd({ tag: 'deployhub/api:v1', dockerfile: '/r/apps/api/Dockerfile', context: '/r', alsoTag: 'deployhub/api:current' }),
    "docker build -f '/r/apps/api/Dockerfile' -t 'deployhub/api:v1' -t 'deployhub/api:current' '/r'",
  );
});

test('runContainerCmd publishes on loopback only', () => {
  const cmd = runContainerCmd({ name: 'api', image: 'deployhub/api:v1', hostPort: 7000, containerPort: 3000, envFile: '/r/api.env' });
  assert.match(cmd, /-p '127\.0\.0\.1:7000:3000'/);
  assert.match(cmd, /--env-file '\/r\/api\.env'/);
  assert.match(cmd, /--label 'deployhub\.app=api'/);
  assert.match(cmd, /--restart 'unless-stopped'/);
});

test('runContainerCmd omits --env-file when there is no env', () => {
  const cmd = runContainerCmd({ name: 'api', image: 'i', hostPort: 1, containerPort: 2, envFile: null });
  assert.ok(!cmd.includes('--env-file'));
});

test('runOnceCmd runs through a shell so pipelines survive', () => {
  assert.equal(
    runOnceCmd({ image: 'deployhub/api:v1', command: 'npx prisma migrate deploy', envFile: '/r/api.env' }),
    "docker run --rm --env-file '/r/api.env' 'deployhub/api:v1' sh -lc 'npx prisma migrate deploy'",
  );
});

test('compose up/down carry the project and file', () => {
  assert.equal(
    composeUpCmd('docker-compose', { project: 'api', file: '/r/compose.yml' }),
    "docker-compose -p 'api' -f '/r/compose.yml' up -d --build --remove-orphans",
  );
  assert.equal(
    composeDownCmd('docker compose', { project: 'api', file: '/r/compose.yml' }),
    "docker compose -p 'api' -f '/r/compose.yml' down --remove-orphans",
  );
});

test('shq escapes embedded single quotes', () => {
  assert.equal(shq("it's"), `'it'\\''s'`);
});

// --- renderEnvFile ---
test('renderEnvFile emits KEY=VALUE without quoting', () => {
  assert.equal(renderEnvFile({ PORT: 7000, NODE_ENV: 'production' }), 'PORT=7000\nNODE_ENV=production\n');
});

test('renderEnvFile keeps values with spaces and = intact', () => {
  assert.equal(renderEnvFile({ DSN: 'postgres://u:p@h/db?a=b c' }), 'DSN=postgres://u:p@h/db?a=b c\n');
});

test('renderEnvFile flattens newlines so a value cannot inject a variable', () => {
  assert.equal(renderEnvFile({ KEY: 'a\nEVIL=1' }), 'KEY=a EVIL=1\n');
});

// --- stats parsing ---
test('parseMemUsage converts docker units to MB', () => {
  assert.equal(parseMemUsage('123.4MiB / 1.9GiB'), 123);
  assert.equal(parseMemUsage('1.5GiB / 4GiB'), 1536);
  assert.equal(parseMemUsage('512KiB / 1GiB'), 1);
  assert.equal(parseMemUsage('garbage'), 0);
});

test('parseCpuPerc strips the sign and rounds', () => {
  assert.equal(parseCpuPerc('12.34%'), 12.3);
  assert.equal(parseCpuPerc('0.00%'), 0);
  assert.equal(parseCpuPerc('--'), 0);
});
