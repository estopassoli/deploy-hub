import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanWorkspaceApps } from './workspace-scan.ts';

function fixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsscan-'));
  const write = (p: string, o: unknown) => {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), typeof o === 'string' ? o : JSON.stringify(o));
  };
  write('package.json', { name: 'blurp', private: true, packageManager: 'pnpm@9.0.0' });
  write('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n  - "apps/*"\n');
  write('apps/backend/package.json', { name: '@blurp/backend', dependencies: { '@nestjs/core': '10' }, scripts: { start: 'node dist/main.js' } });
  fs.mkdirSync(path.join(dir, 'apps/backend/prisma'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps/backend/prisma/schema.prisma'), '');
  write('apps/frontend/package.json', { name: '@blurp/frontend', dependencies: { next: '14' }, scripts: { start: 'next start -p 3000' } });
  write('apps/admin/package.json', { name: '@blurp/admin', dependencies: { next: '14' }, scripts: { start: 'next start -p 3002' } });
  write('packages/ui/package.json', { name: '@blurp/ui', scripts: { build: 'tsc' } }); // lib: no framework/start -> excluded
  return dir;
}

test('scanWorkspaceApps finds the 3 blurp apps and excludes libs', () => {
  const services = scanWorkspaceApps(fixture()).sort((a, b) => a.appDir.localeCompare(b.appDir));
  assert.equal(services.length, 3);
  assert.deepEqual(services.map((s) => s.workspacePackage), ['@blurp/admin', '@blurp/backend', '@blurp/frontend']);
  const backend = services.find((s) => s.workspacePackage === '@blurp/backend')!;
  assert.equal(backend.type, 'nestjs');
  assert.equal(backend.hasPrisma, true);
  assert.equal(backend.appDir, 'apps/backend');
  const admin = services.find((s) => s.workspacePackage === '@blurp/admin')!;
  assert.equal(admin.type, 'nextjs');
  assert.equal(admin.suggestedPort, 3002);
  assert.ok(!services.some((s) => s.workspacePackage === '@blurp/ui'));
});
