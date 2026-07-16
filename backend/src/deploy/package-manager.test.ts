import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  detectPackageManager,
  installCmd,
  runScriptCmd,
  execCmd,
  turboBuildCmd,
  turboBuildManyCmd,
  parseWorkspaceGlobs,
  parseStartPort,
  detectAppType,
  readPackageName,
  type PmInfo,
} from './package-manager.ts';

function tmp(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmtest-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const npm: PmInfo = { name: 'npm', berry: false, viaCorepack: false };
const pnpm: PmInfo = { name: 'pnpm', berry: false, viaCorepack: false };
const yarnClassic: PmInfo = { name: 'yarn', berry: false, viaCorepack: false };
const yarnBerry: PmInfo = { name: 'yarn', berry: true, viaCorepack: false };

// --- detectPackageManager ---
test('packageManager field wins over lockfile', () => {
  const dir = tmp({ 'package.json': JSON.stringify({ packageManager: 'pnpm@9.1.0' }), 'yarn.lock': '' });
  const pm = detectPackageManager(dir);
  assert.equal(pm.name, 'pnpm');
  assert.equal(pm.version, '9.1.0');
  assert.equal(pm.viaCorepack, true);
});

test('packageManager yarn@3 is berry', () => {
  const dir = tmp({ 'package.json': JSON.stringify({ packageManager: 'yarn@3.6.4' }) });
  const pm = detectPackageManager(dir);
  assert.equal(pm.name, 'yarn');
  assert.equal(pm.berry, true);
});

test('pnpm-lock.yaml -> pnpm', () => {
  assert.equal(detectPackageManager(tmp({ 'package.json': '{}', 'pnpm-lock.yaml': '' })).name, 'pnpm');
});

test('yarn.lock -> yarn classic; .yarnrc.yml -> berry', () => {
  const classic = tmp({ 'package.json': '{}', 'yarn.lock': '' });
  assert.equal(detectPackageManager(classic).name, 'yarn');
  assert.equal(detectPackageManager(classic).berry, false);
  const berry = tmp({ 'package.json': '{}', 'yarn.lock': '', '.yarnrc.yml': '' });
  assert.equal(detectPackageManager(berry).berry, true);
});

test('package-lock.json -> npm', () => {
  assert.equal(detectPackageManager(tmp({ 'package.json': '{}', 'package-lock.json': '' })).name, 'npm');
});

test('no lockfile -> npm default', () => {
  assert.equal(detectPackageManager(tmp({ 'package.json': '{}' })).name, 'npm');
});

// --- installCmd ---
test('installCmd pnpm frozen+dev', () => {
  assert.equal(installCmd(pnpm, { includeDev: true, frozen: true }), 'pnpm install --frozen-lockfile --prod=false');
});
test('installCmd pnpm non-frozen+dev', () => {
  assert.equal(installCmd(pnpm, { includeDev: true, frozen: false }), 'pnpm install --prod=false');
});
test('installCmd npm frozen+dev', () => {
  assert.equal(installCmd(npm, { includeDev: true, frozen: true }), 'npm ci --include=dev');
});
test('installCmd npm non-frozen+dev', () => {
  assert.equal(installCmd(npm, { includeDev: true, frozen: false }), 'npm install --include=dev');
});
test('installCmd yarn classic frozen+dev', () => {
  assert.equal(installCmd(yarnClassic, { includeDev: true, frozen: true }), 'yarn install --frozen-lockfile --production=false');
});
test('installCmd yarn berry frozen', () => {
  assert.equal(installCmd(yarnBerry, { includeDev: true, frozen: true }), 'yarn install --immutable');
});

// --- runScriptCmd ---
test('runScriptCmd pnpm monorepo', () => {
  assert.equal(runScriptCmd(pnpm, { pkg: '@blurp/backend', script: 'build' }), 'pnpm --filter @blurp/backend run build');
});
test('runScriptCmd npm monorepo', () => {
  assert.equal(runScriptCmd(npm, { pkg: '@blurp/backend', script: 'build' }), 'npm run build --workspace @blurp/backend');
});
test('runScriptCmd yarn monorepo', () => {
  assert.equal(runScriptCmd(yarnClassic, { pkg: '@blurp/backend', script: 'start' }), 'yarn workspace @blurp/backend run start');
});
test('runScriptCmd single-app', () => {
  assert.equal(runScriptCmd(pnpm, { script: 'build' }), 'pnpm run build');
  assert.equal(runScriptCmd(npm, { script: 'build' }), 'npm run build');
});

// --- execCmd ---
test('execCmd pnpm monorepo', () => {
  assert.equal(execCmd(pnpm, { pkg: '@blurp/backend', argv: ['prisma', 'migrate', 'deploy'] }), 'pnpm --filter @blurp/backend exec prisma migrate deploy');
});
test('execCmd npm monorepo', () => {
  assert.equal(execCmd(npm, { pkg: '@blurp/backend', argv: ['prisma', 'generate'] }), 'npm exec --workspace @blurp/backend -- prisma generate');
});
test('execCmd yarn monorepo', () => {
  assert.equal(execCmd(yarnClassic, { pkg: '@blurp/backend', argv: ['prisma', 'generate'] }), 'yarn workspace @blurp/backend exec prisma generate');
});
test('execCmd single-app', () => {
  assert.equal(execCmd(pnpm, { argv: ['nest', 'build'] }), 'pnpm exec nest build');
  assert.equal(execCmd(npm, { argv: ['prisma', 'generate'] }), 'npx prisma generate');
});

// --- turboBuildCmd ---
test('turboBuildCmd pnpm', () => {
  assert.equal(turboBuildCmd(pnpm, '@blurp/web'), 'pnpm exec turbo run build --filter=@blurp/web');
});
test('turboBuildCmd npm', () => {
  assert.equal(turboBuildCmd(npm, '@blurp/web'), 'npx turbo run build --filter=@blurp/web');
});

// --- detectAppType ---
test('detectAppType next/nest/vite/null', () => {
  assert.equal(detectAppType(tmp({ 'package.json': JSON.stringify({ dependencies: { next: '14' } }) })), 'nextjs');
  assert.equal(detectAppType(tmp({ 'package.json': JSON.stringify({ dependencies: { '@nestjs/core': '10' } }) })), 'nestjs');
  assert.equal(detectAppType(tmp({ 'package.json': JSON.stringify({ devDependencies: { vite: '5' } }) })), 'vitejs');
  assert.equal(detectAppType(tmp({ 'package.json': JSON.stringify({ dependencies: { express: '4' } }) })), null);
});

// --- readPackageName ---
test('readPackageName reads name or undefined', () => {
  assert.equal(readPackageName(tmp({ 'package.json': JSON.stringify({ name: '@blurp/backend' }) })), '@blurp/backend');
  assert.equal(readPackageName(tmp({ 'package.json': '{}' })), undefined);
});

// --- turboBuildManyCmd ---
test('turboBuildManyCmd multi-filter pnpm', () => {
  assert.equal(
    turboBuildManyCmd(pnpm, ['@blurp/backend', '@blurp/frontend']),
    'pnpm exec turbo run build --filter=@blurp/backend --filter=@blurp/frontend',
  );
});
test('turboBuildManyCmd single npm', () => {
  assert.equal(turboBuildManyCmd(npm, ['@blurp/web']), 'npx turbo run build --filter=@blurp/web');
});

// --- parseWorkspaceGlobs ---
test('parseWorkspaceGlobs from pnpm yaml', () => {
  const yaml = 'packages:\n  - "packages/*"\n  - "apps/*"\n';
  assert.deepEqual(parseWorkspaceGlobs(yaml, null), ['packages/*', 'apps/*']);
});
test('parseWorkspaceGlobs from package.json array', () => {
  assert.deepEqual(parseWorkspaceGlobs(null, { workspaces: ['apps/*', 'libs/*'] }), ['apps/*', 'libs/*']);
});
test('parseWorkspaceGlobs from package.json object', () => {
  assert.deepEqual(parseWorkspaceGlobs(null, { workspaces: { packages: ['apps/*'] } }), ['apps/*']);
});
test('parseWorkspaceGlobs empty when none', () => {
  assert.deepEqual(parseWorkspaceGlobs(null, {}), []);
});

// --- parseStartPort ---
test('parseStartPort reads -p and --port', () => {
  assert.equal(parseStartPort({ start: 'next start -p 3002' }), 3002);
  assert.equal(parseStartPort({ start: 'node dist/main.js', dev: 'next dev --port 3000' }), 3000);
  assert.equal(parseStartPort({ start: 'node dist/main.js' }), null);
});
