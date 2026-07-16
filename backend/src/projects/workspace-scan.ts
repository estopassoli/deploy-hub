import * as fs from 'fs';
import * as path from 'path';
import { detectAppType, readPackageName, parseWorkspaceGlobs, parseStartPort } from '../deploy/package-manager.ts';
import type { AppType } from '../deploy/package-manager.ts';

export interface DetectedService {
  appDir: string; // repo-relative, e.g. "apps/backend"
  workspacePackage: string;
  type: AppType;
  suggestedPort: number | null;
  suggestedName: string; // last path segment
  hasPrisma: boolean;
}

/** Expand a workspace glob (only trailing `*` supported, plus explicit paths) into dirs under rootDir. */
function expandGlob(rootDir: string, glob: string): string[] {
  if (glob.endsWith('/*')) {
    const base = glob.slice(0, -2);
    const abs = path.join(rootDir, base);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.posix.join(base, d.name));
  }
  return fs.existsSync(path.join(rootDir, glob)) ? [glob] : [];
}

/** Scan a monorepo root and return the deployable services (framework dep + start/dev script). */
export function scanWorkspaceApps(rootDir: string): DetectedService[] {
  let pkgJson: any = null;
  try {
    pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  } catch {
    /* ignore */
  }
  let pnpmYaml: string | null = null;
  try {
    pnpmYaml = fs.readFileSync(path.join(rootDir, 'pnpm-workspace.yaml'), 'utf-8');
  } catch {
    /* ignore */
  }

  const globs = parseWorkspaceGlobs(pnpmYaml, pkgJson);
  const dirs = new Set<string>();
  for (const g of globs) for (const d of expandGlob(rootDir, g)) dirs.add(d);

  const services: DetectedService[] = [];
  for (const appDir of dirs) {
    const abs = path.join(rootDir, appDir);
    let pkg: any;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(abs, 'package.json'), 'utf-8'));
    } catch {
      continue;
    }
    const type = detectAppType(abs);
    const scripts = pkg.scripts || {};
    const isDeployable = type != null && (scripts.start || scripts.dev);
    if (!isDeployable) continue;
    services.push({
      appDir,
      workspacePackage: readPackageName(abs) || pkg.name || appDir,
      type: type as AppType,
      suggestedPort: parseStartPort(scripts),
      suggestedName: appDir.split('/').pop() || appDir,
      hasPrisma: fs.existsSync(path.join(abs, 'prisma', 'schema.prisma')),
    });
  }
  return services;
}
