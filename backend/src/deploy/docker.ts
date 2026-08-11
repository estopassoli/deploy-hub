/**
 * Docker runtime: detection, command construction and container operations.
 *
 * Everything above the "--- operations ---" divider is pure and unit-tested; the
 * operations below shell out and are exercised against a live daemon.
 *
 * Two shapes are supported, in this order of preference:
 *
 *   compose    — a compose file in the service's own directory. It owns the port
 *                mapping and any sidecars (redis, worker, …). We only bring the
 *                project up and read its containers back.
 *   Dockerfile — we build an image per release and run a single container with the
 *                port and env the panel already knows about.
 *
 * A compose file at the REPO ROOT is deliberately not picked up for a monorepo
 * service: a root compose usually describes every service at once, and bringing it
 * up from one service would start (and later stop) its siblings behind their backs.
 * Single-app deploys have no such ambiguity — there the app directory IS the repo
 * root, so a root compose is found normally.
 */

import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** What actually supervises a deployed app. `static` is nginx serving files from /var/www. */
export type RuntimeKind = 'pm2' | 'docker' | 'static';

/** What the user asked for. `auto` lets the presence of Docker files decide. */
export type RuntimePref = 'auto' | 'pm2' | 'docker';

export const COMPOSE_FILENAMES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
] as const;

/** Label stamped on every container we create, so destructive ops can verify ownership. */
export const OWNER_LABEL = 'deployhub.app';

export interface DockerAssets {
  /** Absolute path to the compose file that owns this service, if any. */
  composeFile: string | null;
  /** Absolute path to the Dockerfile, if any. */
  dockerfile: string | null;
}

export interface ContainerState {
  running: boolean;
  /** Docker's own word: running, exited, restarting, created, paused, dead. */
  status: string;
  startedAt: string | null;
  /** Value of the deployhub.app label, or null when the container is not ours. */
  owner: string | null;
}

// --- pure ---------------------------------------------------------------------

/** Single-quote a value for `sh -c`. */
export function shq(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Find the Docker files that belong to a service.
 *
 * `appWorkDir` is where the service lives (repo root for a single-app deploy).
 * `repoRoot` only serves as a Dockerfile fallback: monorepos commonly keep one
 * Dockerfile at the root that takes the target package as a build arg.
 */
export function detectDockerAssets(appWorkDir: string, repoRoot: string): DockerAssets {
  const composeFile =
    COMPOSE_FILENAMES.map((f) => path.join(appWorkDir, f)).find((p) => fs.existsSync(p)) ?? null;

  const localDockerfile = path.join(appWorkDir, 'Dockerfile');
  const rootDockerfile = path.join(repoRoot, 'Dockerfile');
  const dockerfile = fs.existsSync(localDockerfile)
    ? localDockerfile
    : fs.existsSync(rootDockerfile)
      ? rootDockerfile
      : null;

  return { composeFile, dockerfile };
}

/**
 * Decide the runtime for a deploy.
 *
 * An explicit `docker` preference with no Docker files is an error rather than a
 * silent fallback to PM2: the app would come up under a supervisor the user did not
 * ask for, and the failure would only surface as a 502 much later.
 */
export function resolveRuntime(
  pref: RuntimePref | null | undefined,
  assets: DockerAssets,
  fallback: RuntimeKind = 'pm2',
): RuntimeKind {
  const hasDocker = Boolean(assets.composeFile || assets.dockerfile);
  switch (pref) {
    case 'docker':
      if (!hasDocker) {
        throw new Error(
          'Runtime "docker" selecionado, mas não há Dockerfile nem compose no diretório do app.',
        );
      }
      return 'docker';
    case 'pm2':
      return fallback;
    case 'auto':
    default:
      return hasDocker ? 'docker' : fallback;
  }
}

/** Image repository for an app — one tag per release plus a moving `current`. */
export function imageName(appName: string): string {
  return `deployhub/${appName}`;
}

export function imageTag(appName: string, version: string): string {
  return `${imageName(appName)}:${version}`;
}

/** Containers are named after the app so `docker logs <app>` works by hand too. */
export function containerName(appName: string): string {
  return appName;
}

/** Compose project name — namespaces the compose containers under the app. */
export function composeProject(appName: string): string {
  // Compose only accepts [a-z0-9][a-z0-9_-]* as a project name.
  return appName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^[^a-z0-9]+/, '');
}

/**
 * First EXPOSE port declared in a Dockerfile, if any.
 *
 * Used as the default port INSIDE the container when the panel has no explicit
 * value. `EXPOSE 8080/tcp` and multiple ports on one line are both accepted; the
 * first wins, which is the one images conventionally serve on.
 */
export function parseExposedPort(dockerfileText: string): number | null {
  for (const raw of dockerfileText.split('\n')) {
    const line = raw.trim();
    if (!/^EXPOSE\s/i.test(line)) continue;
    const m = line.replace(/^EXPOSE\s+/i, '').match(/(\d+)/);
    if (m) {
      const port = parseInt(m[1], 10);
      if (Number.isFinite(port) && port > 0 && port < 65536) return port;
    }
  }
  return null;
}

export function buildImageCmd(o: {
  tag: string;
  dockerfile: string;
  context: string;
  /** Also tag the image as `<repo>:current` so a plain `docker run <repo>:current` works. */
  alsoTag?: string;
}): string {
  const parts = ['docker', 'build', '-f', shq(o.dockerfile), '-t', shq(o.tag)];
  if (o.alsoTag) parts.push('-t', shq(o.alsoTag));
  parts.push(shq(o.context));
  return parts.join(' ');
}

/**
 * Run the release container.
 *
 * The port is published on 127.0.0.1 only — nginx proxies to 127.0.0.1:<port>, and
 * binding 0.0.0.0 would expose every app's raw port to the internet, bypassing the
 * vhost (and its TLS) entirely. Docker publishes straight to iptables, so a host
 * firewall would not catch that.
 */
export function runContainerCmd(o: {
  name: string;
  image: string;
  hostPort: number;
  containerPort: number;
  envFile?: string | null;
  restart?: string;
}): string {
  const parts = [
    'docker', 'run', '-d',
    '--name', shq(o.name),
    '--restart', shq(o.restart || 'unless-stopped'),
    '--label', shq(`${OWNER_LABEL}=${o.name}`),
  ];
  if (o.envFile) parts.push('--env-file', shq(o.envFile));
  parts.push('-p', shq(`127.0.0.1:${o.hostPort}:${o.containerPort}`));
  parts.push(shq(o.image));
  return parts.join(' ');
}

/** One-off container from a built image — used to run migrations before the app starts. */
export function runOnceCmd(o: {
  image: string;
  command: string;
  envFile?: string | null;
}): string {
  const parts = ['docker', 'run', '--rm'];
  if (o.envFile) parts.push('--env-file', shq(o.envFile));
  parts.push(shq(o.image), 'sh', '-lc', shq(o.command));
  return parts.join(' ');
}

export function composeUpCmd(bin: string, o: { project: string; file: string }): string {
  return `${bin} -p ${shq(o.project)} -f ${shq(o.file)} up -d --build --remove-orphans`;
}

export function composeDownCmd(bin: string, o: { project: string; file: string }): string {
  return `${bin} -p ${shq(o.project)} -f ${shq(o.file)} down --remove-orphans`;
}

/** Render an env map as a docker --env-file. */
export function renderEnvFile(env: Record<string, string | number>): string {
  return (
    Object.entries(env)
      // An env-file line is `KEY=VALUE` verbatim — no quoting, no interpolation. A
      // newline in a value would be read as the start of another variable, so those
      // are dropped rather than allowed to inject one.
      .map(([k, v]) => `${k}=${String(v).replace(/[\r\n]+/g, ' ')}`)
      .join('\n') + '\n'
  );
}

/** Parse `docker stats` memory ("123.4MiB / 1.9GiB") into whole megabytes. */
export function parseMemUsage(memUsage: string): number {
  const m = memUsage.trim().match(/^([\d.]+)\s*([A-Za-z]+)/);
  if (!m) return 0;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return 0;
  const unit = m[2].toLowerCase();
  const toMb: Record<string, number> = {
    b: 1 / (1024 * 1024),
    kb: 1 / 1024, kib: 1 / 1024,
    mb: 1, mib: 1,
    gb: 1024, gib: 1024,
    tb: 1024 * 1024, tib: 1024 * 1024,
  };
  return Math.round(value * (toMb[unit] ?? 0));
}

export function parseCpuPerc(cpuPerc: string): number {
  const v = parseFloat(cpuPerc.replace('%', '').trim());
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
}

// --- operations ---------------------------------------------------------------

let composeBinCache: string | null | undefined;

/**
 * The compose entrypoint available on this host, or null if compose is missing.
 *
 * Both spellings exist in the wild and they are not interchangeable: the v2 plugin
 * answers to `docker compose`, while older hosts only have the standalone
 * `docker-compose` binary. Probing beats assuming — this very server has the
 * standalone binary and no plugin.
 */
export async function composeBin(): Promise<string | null> {
  if (composeBinCache !== undefined) return composeBinCache;
  for (const bin of ['docker compose', 'docker-compose']) {
    try {
      await execAsync(`${bin} version`);
      composeBinCache = bin;
      return bin;
    } catch {
      /* try the next spelling */
    }
  }
  composeBinCache = null;
  return null;
}

/** Reset the memoized compose probe (tests). */
export function resetComposeBinCache(): void {
  composeBinCache = undefined;
}

/**
 * Validate a compose file with the host's compose binary, and translate the one
 * failure mode that reads as nonsense.
 *
 * `docker-compose` is frequently a snap, and a snap is filesystem-confined: it gets a
 * private /tmp and cannot see paths outside the interfaces it was granted. Handed a
 * compose file under a release directory it has no access to, it reports "no such file
 * or directory" for a file that plainly exists — which sends you looking for a typo
 * that is not there. When the file exists and compose still cannot open it, say what is
 * actually wrong and how to fix it.
 *
 * Returns null when the file is readable and valid, otherwise the message to fail with.
 */
export async function diagnoseCompose(bin: string, file: string): Promise<string | null> {
  try {
    await execAsync(`${bin} -f ${shq(file)} config -q`);
    return null;
  } catch (e: any) {
    const msg = String(e?.stderr || e?.message || '').trim();
    if (/no such file or directory/i.test(msg) && fs.existsSync(file)) {
      return (
        `O compose deste host ("${bin}") não consegue ler ${file}, apesar do arquivo existir. ` +
        `Isso acontece quando o compose está instalado como snap: ele roda confinado e só ` +
        `enxerga alguns diretórios. Instale o plugin oficial, que não é confinado:\n` +
        `  sudo apt install docker-compose-v2`
      );
    }
    return `compose recusou ${path.basename(file)}: ${msg}`;
  }
}

export async function imageExists(tag: string): Promise<boolean> {
  try {
    await execAsync(`docker image inspect ${shq(tag)}`);
    return true;
  } catch {
    return false;
  }
}

export async function dockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info');
    return true;
  } catch {
    return false;
  }
}

export async function inspectContainer(name: string): Promise<ContainerState | null> {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format '{{.State.Running}};{{.State.Status}};{{.State.StartedAt}};{{index .Config.Labels "${OWNER_LABEL}"}}' ${shq(name)}`,
    );
    const [running, status, startedAt, owner] = stdout.trim().split(';');
    return {
      running: running === 'true',
      status: status || 'unknown',
      startedAt: startedAt && startedAt !== '<no value>' ? startedAt : null,
      owner: owner && owner !== '<no value>' ? owner : null,
    };
  } catch {
    return null;
  }
}

/** Container ids belonging to a compose project (running and stopped). */
export async function composeContainerIds(project: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `docker ps -aq --filter ${shq(`label=com.docker.compose.project=${project}`)}`,
    );
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * CPU percentage and megabytes for a set of containers, summed.
 *
 * `docker stats` on a stopped container is an error, not an empty row, so callers
 * pass only ids they already know are up.
 */
export async function containerStats(ids: string[]): Promise<{ cpu: number; memory: number }> {
  if (ids.length === 0) return { cpu: 0, memory: 0 };
  try {
    const { stdout } = await execAsync(
      `docker stats --no-stream --format '{{.CPUPerc}};{{.MemUsage}}' ${ids.map(shq).join(' ')}`,
    );
    let cpu = 0;
    let memory = 0;
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const [cpuPerc, memUsage = ''] = line.split(';');
      cpu += parseCpuPerc(cpuPerc);
      memory += parseMemUsage(memUsage);
    }
    return { cpu: Math.round(cpu * 10) / 10, memory };
  } catch {
    return { cpu: 0, memory: 0 };
  }
}

export async function containerLogs(ref: string, lines: number): Promise<string> {
  try {
    // Docker writes app stderr to the container's stderr; 2>&1 keeps both streams in
    // the order they were produced instead of dropping half the output.
    const { stdout } = await execAsync(
      `docker logs --tail ${Number(lines) || 100} ${shq(ref)} 2>&1 || true`,
      { maxBuffer: 20 * 1024 * 1024 },
    );
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Every container belonging to an app — the single container we named after it plus
 * any members of its compose project.
 *
 * Both lookups go through labels rather than the container name. A name filter in
 * Docker is a substring match (`--filter name=api` also matches `legacy-api-old`),
 * and these ids feed `rm -f`; matching our own label means we can only ever destroy
 * containers this panel created.
 */
export async function appContainerIds(appName: string): Promise<string[]> {
  const ids = new Set<string>();
  for (const label of [
    `${OWNER_LABEL}=${appName}`,
    `com.docker.compose.project=${composeProject(appName)}`,
  ]) {
    try {
      const { stdout } = await execAsync(`docker ps -aq --filter ${shq(`label=${label}`)}`);
      for (const id of stdout.split('\n').map((s) => s.trim()).filter(Boolean)) ids.add(id);
    } catch {
      /* daemon down or nothing matched */
    }
  }
  return [...ids];
}

/** Aggregate state of an app's containers. `running` only when every one of them is up. */
export async function appState(
  appName: string,
): Promise<{ running: boolean; status: string; startedAt: string | null; count: number }> {
  const ids = await appContainerIds(appName);
  if (ids.length === 0) return { running: false, status: 'stopped', startedAt: null, count: 0 };

  const states = (await Promise.all(ids.map((id) => inspectContainer(id)))).filter(
    (s): s is ContainerState => s !== null,
  );
  if (states.length === 0) return { running: false, status: 'stopped', startedAt: null, count: 0 };

  const running = states.every((s) => s.running);
  const startedAt = states
    .map((s) => s.startedAt)
    .filter((v): v is string => Boolean(v))
    .sort()[0] ?? null;

  return {
    running,
    // A partially-up compose project is not "running", and calling it merely stopped
    // hides a crash-looping sidecar — surface the worst container's own status.
    status: running ? 'running' : (states.find((s) => !s.running)?.status ?? 'stopped'),
    startedAt,
    count: states.length,
  };
}

export async function appStats(appName: string): Promise<{ cpu: number; memory: number }> {
  const ids = await appContainerIds(appName);
  if (ids.length === 0) return { cpu: 0, memory: 0 };
  const states = await Promise.all(ids.map(async (id) => ({ id, state: await inspectContainer(id) })));
  return containerStats(states.filter((s) => s.state?.running).map((s) => s.id));
}

export async function appLogs(appName: string, lines: number): Promise<string> {
  const ids = await appContainerIds(appName);
  if (ids.length === 0) return '';
  const chunks = await Promise.all(ids.map((id) => containerLogs(id, lines)));
  return chunks.join('\n');
}

export async function stopApp(appName: string): Promise<void> {
  const ids = await appContainerIds(appName);
  await Promise.all(ids.map((id) => execAsync(`docker stop ${shq(id)}`).catch(() => undefined)));
}

export async function startApp(appName: string): Promise<void> {
  const ids = await appContainerIds(appName);
  if (ids.length === 0) throw new Error(`Nenhum container do app "${appName}" — faça o deploy primeiro.`);
  for (const id of ids) await execAsync(`docker start ${shq(id)}`);
}

export async function restartApp(appName: string): Promise<void> {
  const ids = await appContainerIds(appName);
  if (ids.length === 0) throw new Error(`Nenhum container do app "${appName}" — faça o deploy primeiro.`);
  for (const id of ids) await execAsync(`docker restart ${shq(id)}`);
}

export async function removeApp(appName: string): Promise<void> {
  const ids = await appContainerIds(appName);
  await Promise.all(ids.map((id) => execAsync(`docker rm -f ${shq(id)}`).catch(() => undefined)));
}

export async function stopContainer(name: string): Promise<void> {
  await execAsync(`docker stop ${shq(name)}`).catch(() => undefined);
}

export async function startContainer(name: string): Promise<void> {
  await execAsync(`docker start ${shq(name)}`);
}

export async function restartContainer(name: string): Promise<void> {
  await execAsync(`docker restart ${shq(name)}`);
}

export async function removeContainer(name: string): Promise<void> {
  await execAsync(`docker rm -f ${shq(name)}`).catch(() => undefined);
}

/** Remove every image built for an app (all release tags). Best-effort. */
export async function removeImages(appName: string): Promise<void> {
  try {
    const { stdout } = await execAsync(
      `docker images --format '{{.Repository}}:{{.Tag}}' ${shq(imageName(appName))}`,
    );
    const tags = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    if (tags.length) {
      await execAsync(`docker rmi -f ${tags.map(shq).join(' ')}`).catch(() => undefined);
    }
  } catch {
    /* nothing to remove */
  }
}
