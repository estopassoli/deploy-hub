import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRANCH_PATTERN, NAME_PATTERN, isSafeDomain, isSafeRepositoryUrl } from './validation.ts';

test('NAME_PATTERN aceita nomes de app e recusa o resto', () => {
  for (const ok of ['meu-app', 'app2', '1app', 'a']) {
    assert.equal(NAME_PATTERN.test(ok), true, ok);
  }
  for (const bad of ['-app', 'Meu-App', 'meu_app', 'meu app', '../x', 'app;id']) {
    assert.equal(NAME_PATTERN.test(bad), false, bad);
  }
});

test('BRANCH_PATTERN aceita branches reais e recusa metacaractere', () => {
  for (const ok of ['main', 'feat/nova', 'release/v1.2.3', 'fix-123', 'v1.0']) {
    assert.equal(BRANCH_PATTERN.test(ok), true, ok);
  }
  for (const bad of ['main; rm -rf /', 'main && id', '$(id)', 'main|cat', 'main `id`', 'a b']) {
    assert.equal(BRANCH_PATTERN.test(bad), false, bad);
  }
});

// --- repositório --------------------------------------------------------------

test('isSafeRepositoryUrl aceita as duas formas que o painel usa', () => {
  const validos = [
    'git@github.com:estopassoli/deploy-hub.git',
    'git@gitlab.com:grupo/sub/projeto.git',
    'git@192.168.0.10:infra/repo.git',
    'https://github.com/estopassoli/deploy-hub.git',
    'https://github.com/estopassoli/deploy-hub',
    'https://git.empresa.com:8443/time/repo.git',
  ];
  for (const url of validos) {
    assert.equal(isSafeRepositoryUrl(url), true, url);
  }
});

test('isSafeRepositoryUrl recusa argumento que o git leria como flag', () => {
  // --upload-pack faz o git executar um comando arbitrário. O perigo aqui não é o
  // shell — é o próprio git — então o execFile sozinho não protegeria.
  assert.equal(isSafeRepositoryUrl('--upload-pack=touch /tmp/pwned'), false);
  assert.equal(isSafeRepositoryUrl('-u git@github.com:x/y.git'), false);
  assert.equal(isSafeRepositoryUrl('--config=core.sshCommand=id'), false);
});

test('isSafeRepositoryUrl recusa esquemas que clonam coisas do próprio servidor', () => {
  assert.equal(isSafeRepositoryUrl('file:///root/apps'), false);
  assert.equal(isSafeRepositoryUrl('/root/apps/algum-app'), false);
  assert.equal(isSafeRepositoryUrl('ext::sh -c "id > /tmp/x"'), false);
  assert.equal(isSafeRepositoryUrl('http://github.com/x/y.git'), false, 'http sem TLS');
});

test('isSafeRepositoryUrl recusa metacaractere e espaço em branco', () => {
  const ruins = [
    'git@github.com:x/y.git; id',
    'git@github.com:x/y.git && id',
    'git@github.com:x/$(id).git',
    'git@github.com:x/`id`.git',
    'git@github.com:x/y.git\nid',
    'git@github.com: x/y.git',
    '',
    '   ',
  ];
  for (const url of ruins) {
    assert.equal(isSafeRepositoryUrl(url), false, JSON.stringify(url));
  }
});

test('isSafeRepositoryUrl recusa não-string e valor gigante', () => {
  assert.equal(isSafeRepositoryUrl(null), false);
  assert.equal(isSafeRepositoryUrl(42), false);
  assert.equal(isSafeRepositoryUrl(`https://github.com/${'a'.repeat(3000)}/y.git`), false);
});

// --- domínio ------------------------------------------------------------------

test('isSafeDomain aceita hostname e recusa o resto', () => {
  for (const ok of ['api.exemplo.com', 'painel.sub.exemplo.com.br', 'a-b.co']) {
    assert.equal(isSafeDomain(ok), true, ok);
  }
  for (const bad of [
    'https://api.exemplo.com',
    'api.exemplo.com/caminho',
    'api.exemplo.com:443',
    'api exemplo.com',
    'api.exemplo.com; id',
    '-api.exemplo.com',
    'localhost',
    '',
    null,
  ]) {
    assert.equal(isSafeDomain(bad), false, String(bad));
  }
});
