import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  APP_PRESET_IDS,
  detectPresetFromPackageJson,
  getPreset,
  isStaticPreset,
  presetOutputDir,
} from './app-presets.ts';

const detect = (deps: Record<string, string>, scripts: Record<string, string> = {}) =>
  detectPresetFromPackageJson({ dependencies: deps, scripts })?.id ?? null;

// --- compatibilidade com o que já está no banco ------------------------------

test('os três tipos antigos continuam existindo com o mesmo id', () => {
  // São os valores gravados nos 21 apps em produção. Mudar um id quebraria todos.
  for (const id of ['nestjs', 'nextjs', 'vitejs']) {
    assert.ok(APP_PRESET_IDS.includes(id), id);
  }
});

test('detecção dos três tipos antigos não mudou', () => {
  assert.equal(detect({ next: '14' }), 'nextjs');
  assert.equal(detect({ '@nestjs/core': '10' }), 'nestjs');
  assert.equal(detect({ vite: '5' }), 'vitejs');
});

test('vitejs continua sendo estático e nestjs/nextjs continuam processo', () => {
  assert.equal(isStaticPreset('vitejs'), true);
  assert.equal(isStaticPreset('nestjs'), false);
  assert.equal(isStaticPreset('nextjs'), false);
});

// --- frameworks novos ---------------------------------------------------------

test('detecta os frameworks adicionados', () => {
  assert.equal(detect({ nuxt: '3' }), 'nuxt');
  assert.equal(detect({ '@remix-run/serve': '2' }), 'remix');
  assert.equal(detect({ '@react-router/serve': '7' }), 'remix');
  assert.equal(detect({ vinext: '1' }), 'vinext');
});

test('Astro estático e Astro SSR são presets diferentes', () => {
  // A distinção importa: um vai para /var/www como arquivos, o outro sobe um processo.
  // Sem ela, um Astro com adapter Node seria copiado como estático e serviria um
  // diretório vazio.
  assert.equal(detect({ astro: '4' }), 'astro');
  assert.equal(isStaticPreset('astro'), true);

  assert.equal(detect({ astro: '4', '@astrojs/node': '8' }), 'astro-ssr');
  assert.equal(isStaticPreset('astro-ssr'), false);
});

test('SvelteKit distingue adapter-node de adapter-static', () => {
  assert.equal(detect({ '@sveltejs/kit': '2', '@sveltejs/adapter-node': '5' }), 'sveltekit');
  assert.equal(isStaticPreset('sveltekit'), false);

  assert.equal(detect({ '@sveltejs/kit': '2', '@sveltejs/adapter-static': '3' }), 'sveltekit-static');
  assert.equal(isStaticPreset('sveltekit-static'), true);
  assert.equal(presetOutputDir('sveltekit-static'), 'build', 'SvelteKit gera em build/, não dist/');
});

test('frameworks que usam Vite por baixo não são detectados como Vite', () => {
  // Astro e SvelteKit dependem de vite; se a ordem estivesse errada, todo projeto
  // Astro viraria "Vite estático".
  assert.equal(detect({ astro: '4', vite: '5' }), 'astro');
  assert.equal(detect({ '@sveltejs/kit': '2', '@sveltejs/adapter-node': '5', vite: '5' }), 'sveltekit');
  assert.equal(detect({ next: '14', vite: '5' }), 'nextjs');
});

test('app Node sem framework conhecido cai em `node` quando tem script start', () => {
  assert.equal(detect({ express: '4' }, { start: 'node index.js' }), 'node');
  assert.equal(detect({ fastify: '4' }, { start: 'node server.js' }), 'node');
  assert.equal(isStaticPreset('node'), false);
});

test('sem framework e sem script start, não detecta nada', () => {
  // O preset `static` genérico é escolha explícita do usuário, nunca automática:
  // adivinhar "estático" e copiar o nada para /var/www apagaria o site publicado.
  assert.equal(detect({ express: '4' }), null);
  assert.equal(detect({}), null);
  assert.equal(detectPresetFromPackageJson(null), null);
});

// --- helpers ------------------------------------------------------------------

test('getPreset devolve null para id desconhecido', () => {
  assert.equal(getPreset('django'), null);
  assert.equal(getPreset(null), null);
  assert.equal(getPreset(undefined), null);
});

test('isStaticPreset é conservador com id desconhecido', () => {
  // Um processo a mais no PM2 é recuperável; copiar o nada para /var/www não é.
  assert.equal(isStaticPreset('id-do-futuro'), false);
  assert.equal(isStaticPreset(null), false);
});

test('presetOutputDir tem default dist', () => {
  assert.equal(presetOutputDir('vitejs'), 'dist');
  assert.equal(presetOutputDir('astro'), 'dist');
  assert.equal(presetOutputDir('desconhecido'), 'dist');
});

test('todo preset tem id, label e kind válidos', () => {
  const ids = new Set<string>();
  for (const id of APP_PRESET_IDS) {
    assert.ok(!ids.has(id), `id duplicado: ${id}`);
    ids.add(id);
    const preset = getPreset(id)!;
    assert.ok(preset.label.length > 0, id);
    assert.ok(['static', 'node'].includes(preset.kind), id);
    if (preset.kind === 'static') assert.ok(preset.outputDir, `${id} estático precisa de outputDir`);
  }
});
