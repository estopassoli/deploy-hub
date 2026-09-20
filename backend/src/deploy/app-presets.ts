/**
 * Registro de presets de aplicação.
 *
 * ## O que isto substitui
 *
 * O tipo de app era um enum fechado de três valores — `nestjs | nextjs | vitejs` —
 * repetido em quatro lugares (dois DTOs, o `detectAppType` e os selects do frontend).
 * Qualquer framework fora dessa lista só dava para deployar preenchendo build e start
 * na mão, e mesmo assim `type` precisava ser um dos três, o que fazia o pipeline tomar
 * decisões erradas: um app Astro estático cadastrado como `nestjs` tentava subir no PM2
 * em vez de ir para o `/var/www`.
 *
 * Um preset descreve o que o pipeline precisa saber:
 *
 *   - **como detectar** a partir do `package.json`;
 *   - **como buildar** e **como iniciar**, quando o padrão do framework difere de
 *     `npm run build` / `npm start`;
 *   - **se é estático** (vai para o nginx a partir de `/var/www`) ou um processo Node;
 *   - **onde fica a saída** do build, para o caso estático.
 *
 * ## Compatibilidade
 *
 * Os ids `nestjs`, `nextjs` e `vitejs` continuam existindo com exatamente o mesmo
 * comportamento — são os valores que já estão gravados no banco dos 21 apps em
 * produção, e nada os reescreve.
 *
 * Módulo puro: sem Nest, sem decorator, testável pelo `node --test`.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface AppPreset {
  /** Valor gravado em `App.type`. Nunca mude os ids existentes. */
  id: string;
  /** Rótulo exibido no painel. */
  label: string;
  /** Descrição curta para o select. */
  description: string;
  /**
   * Dependências que identificam o framework, em ordem de prioridade.
   * A detecção percorre os presets na ordem deste array e para na primeira que casar.
   */
  detect: {
    /** Pacotes em dependencies/devDependencies. */
    packages?: string[];
    /** Todos estes precisam existir (para distinguir SSR de estático). */
    allOf?: string[];
    /** Nenhum destes pode existir. */
    noneOf?: string[];
    /** Campo do package.json que precisa existir (ex.: `scripts.start`). */
    hasScript?: string;
  };
  /**
   * `static` = build vira arquivos servidos pelo nginx a partir de /var/www.
   * `node` = processo supervisionado (PM2 ou container).
   */
  kind: 'static' | 'node';
  /** Pasta de saída do build, relativa ao diretório do app. Só para `static`. */
  outputDir?: string;
  /** Script de build no package.json. `null` = o app não precisa de build. */
  buildScript: string | null;
  /** Script de start. Ignorado para `static` e quando o usuário define o seu. */
  startScript: string | null;
  /**
   * Binário a executar diretamente em vez de um script, quando rodar pelo wrapper do
   * package manager causaria problema (ver `binResolverPrelude`: um wrapper não
   * repassa o sinal de parada e o processo órfão segura a porta).
   */
  directBin?: { pkg: string; bin: string; args: (port: number) => string[] };
}

/**
 * Ordem importa: a detecção para no primeiro que casar.
 *
 * Frameworks que embutem outro vêm antes. Next.js depende de React mas não de Vite;
 * Astro e SvelteKit usam Vite por baixo, então precisam vir **antes** do preset `vitejs`,
 * senão todo projeto Astro seria detectado como Vite estático — e um Astro com adapter
 * SSR seria copiado para /var/www como arquivos, servindo um diretório vazio.
 */
export const APP_PRESETS: AppPreset[] = [
  {
    id: 'nextjs',
    label: 'Next.js',
    description: 'SSR / App Router — processo Node',
    detect: { packages: ['next'] },
    kind: 'node',
    buildScript: 'build',
    startScript: 'start',
    directBin: { pkg: 'next', bin: 'next', args: (port) => ['start', '--port', String(port)] },
  },
  {
    id: 'nestjs',
    label: 'NestJS',
    description: 'API — processo Node',
    detect: { packages: ['@nestjs/core'] },
    kind: 'node',
    buildScript: 'build',
    startScript: 'start',
  },
  {
    id: 'nuxt',
    label: 'Nuxt',
    description: 'Vue SSR — processo Node',
    detect: { packages: ['nuxt', 'nuxt3'] },
    kind: 'node',
    buildScript: 'build',
    startScript: 'start',
  },
  {
    id: 'remix',
    label: 'Remix / React Router',
    description: 'SSR — processo Node',
    detect: { packages: ['@remix-run/serve', '@remix-run/node', '@react-router/serve'] },
    kind: 'node',
    buildScript: 'build',
    startScript: 'start',
  },
  {
    id: 'sveltekit',
    label: 'SvelteKit',
    description: 'SSR com adapter-node — processo Node',
    detect: { allOf: ['@sveltejs/kit'], packages: ['@sveltejs/adapter-node'] },
    kind: 'node',
    buildScript: 'build',
    startScript: 'start',
  },
  {
    id: 'sveltekit-static',
    label: 'SvelteKit (estático)',
    description: 'adapter-static — servido pelo Nginx',
    detect: { allOf: ['@sveltejs/kit'], packages: ['@sveltejs/adapter-static'] },
    kind: 'static',
    outputDir: 'build',
    buildScript: 'build',
    startScript: null,
  },
  {
    id: 'astro-ssr',
    label: 'Astro (SSR)',
    description: 'Com adapter Node — processo Node',
    detect: { allOf: ['astro'], packages: ['@astrojs/node'] },
    kind: 'node',
    buildScript: 'build',
    startScript: 'start',
  },
  {
    id: 'astro',
    label: 'Astro (estático)',
    description: 'Site estático — servido pelo Nginx',
    detect: { packages: ['astro'] },
    kind: 'static',
    outputDir: 'dist',
    buildScript: 'build',
    startScript: null,
  },
  {
    id: 'vinext',
    label: 'vinext',
    description: 'Next.js sobre Vite — processo Node',
    detect: { packages: ['vinext'] },
    kind: 'node',
    buildScript: 'build',
    startScript: 'start',
  },
  {
    id: 'vitejs',
    label: 'Vite (SPA)',
    description: 'SPA estática — servida pelo Nginx',
    detect: { packages: ['vite'] },
    kind: 'static',
    outputDir: 'dist',
    buildScript: 'build',
    startScript: null,
  },
  {
    id: 'node',
    label: 'Node genérico',
    description: 'Express, Fastify, worker — usa npm start',
    detect: { hasScript: 'start' },
    kind: 'node',
    buildScript: null,
    startScript: 'start',
  },
  {
    id: 'static',
    label: 'Estático genérico',
    description: 'Qualquer build que gere arquivos — servido pelo Nginx',
    detect: {},
    kind: 'static',
    outputDir: 'dist',
    buildScript: 'build',
    startScript: null,
  },
];

/** Ids válidos, para os DTOs. */
export const APP_PRESET_IDS = APP_PRESETS.map((preset) => preset.id);

export function getPreset(id: string | null | undefined): AppPreset | null {
  return APP_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * True quando o app é servido como arquivos estáticos pelo nginx.
 *
 * Substitui os `type === 'vitejs'` espalhados pelo pipeline. Um id desconhecido —
 * gravado por uma versão futura e revertida, por exemplo — cai em `false`, que é o
 * lado seguro: um processo a mais no PM2 é recuperável; copiar o nada para /var/www e
 * apagar o site não é.
 */
export function isStaticPreset(id: string | null | undefined): boolean {
  return getPreset(id)?.kind === 'static';
}

/** Pasta de saída do build de um preset estático. */
export function presetOutputDir(id: string | null | undefined): string {
  return getPreset(id)?.outputDir ?? 'dist';
}

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

/** Detecta o preset a partir de um package.json já lido. */
export function detectPresetFromPackageJson(pkg: PackageJsonLike | null): AppPreset | null {
  if (!pkg) return null;

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const scripts = pkg.scripts || {};

  for (const preset of APP_PRESETS) {
    const { packages, allOf, noneOf, hasScript } = preset.detect;

    // O preset `static` genérico tem `detect` vazio e serve de último recurso: só casa
    // por chamada explícita, nunca pela varredura automática.
    if (!packages && !allOf && !noneOf && !hasScript) continue;

    if (allOf && !allOf.every((name) => deps[name])) continue;
    if (noneOf && noneOf.some((name) => deps[name])) continue;
    if (packages && !packages.some((name) => deps[name])) continue;
    if (hasScript && !scripts[hasScript]) continue;

    return preset;
  }

  return null;
}

/** Detecta o preset lendo o package.json de um diretório. */
export function detectPreset(appWorkDir: string): AppPreset | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appWorkDir, 'package.json'), 'utf-8'));
    return detectPresetFromPackageJson(pkg);
  } catch {
    return null;
  }
}

/** Opções para o select do painel. */
export function presetOptions(): Array<{ id: string; label: string; description: string; kind: string }> {
  return APP_PRESETS.map(({ id, label, description, kind }) => ({ id, label, description, kind }));
}
