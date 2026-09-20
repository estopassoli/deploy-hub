import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CreateAppDto,
  UpdateAppDto,
  normalizeContainerPort,
  normalizePort,
} from './apps.dto.ts';

/** Mesmas opções do ValidationPipe global de main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

function run(metatype: unknown, body: unknown): Promise<any> {
  return pipe.transform(body, { type: 'body', metatype, data: '' } as any);
}

async function expectRejection(metatype: unknown, body: unknown): Promise<string> {
  try {
    await run(metatype, body);
  } catch (error: any) {
    return JSON.stringify(error?.response ?? error?.message ?? error);
  }
  assert.fail('esperava que o ValidationPipe rejeitasse o body');
}

// --- o bug original -----------------------------------------------------------

// Reproduz o UpdateAppDto de antes desta correção: uma classe sem validador nenhum.
class DtoSemDecorator {
  envVars?: string;
}

test('regressão: com as opções antigas, um DTO sem validador era apagado em silêncio', async () => {
  // Opções antigas de main.ts: whitelist sem forbidNonWhitelisted. Era exatamente assim
  // que o body de PUT /api/apps/:id chegava vazio ao AppsService.update — nada salvo, e
  // a API respondendo 200 com "Configurações salvas!" na UI.
  const pipeAntigo = new ValidationPipe({ whitelist: true, transform: true });
  const result = await pipeAntigo.transform(
    { envVars: 'A=1' },
    { type: 'body', metatype: DtoSemDecorator, data: '' } as any,
  );

  assert.deepEqual({ ...result }, {}, 'o whitelist descarta toda propriedade sem validador');
});

test('regressão: com forbidNonWhitelisted, o mesmo DTO falha alto em vez de calar', async () => {
  // A segunda metade da correção: se algum DTO voltar a ficar sem decorator, a request
  // quebra com 400 em vez de fingir sucesso.
  const message = await expectRejection(DtoSemDecorator, { envVars: 'A=1' });
  assert.match(message, /envVars should not exist/);
});

// --- UpdateAppDto -------------------------------------------------------------

test('UpdateAppDto preserva envVars', async () => {
  const envVars = 'DATABASE_URL=postgres://user:pass@host/db\nNODE_ENV=production';
  const result = await run(UpdateAppDto, { envVars });
  assert.equal(result.envVars, envVars);
});

test('UpdateAppDto preserva todos os campos que a UI envia', async () => {
  const body = {
    domain: 'api.exemplo.com',
    branch: 'feat/nova-branch',
    envVars: 'A=1',
    installCommand: 'pnpm install',
    buildCommand: 'pnpm build',
    migrateCommand: 'pnpm prisma migrate deploy',
    startCommand: 'node dist/main.js',
    appDir: 'apps/backend',
    workspacePackage: '@acme/backend',
    runtime: 'docker',
    containerPort: 8080,
    dockerContext: '.',
  };

  const result = await run(UpdateAppDto, body);
  // Spread porque o pipe devolve uma instância de UpdateAppDto, não um objeto puro.
  assert.deepEqual({ ...result }, body);
});

test('UpdateAppDto aceita string vazia para limpar um campo', async () => {
  const result = await run(UpdateAppDto, { envVars: '', startCommand: '' });
  assert.equal(result.envVars, '');
  assert.equal(result.startCommand, '');
});

test('UpdateAppDto deixa campo ausente como undefined num update parcial', async () => {
  // Invariante crítico: AppsService.update só grava o que for `!== undefined`. O
  // plainToInstance materializa todas as chaves decoradas, então o que importa não é a
  // ausência da chave e sim o valor continuar `undefined`.
  //
  // O risco concreto está no containerPort: ele tem um @Transform que mapeia '' e null
  // para null. Se esse transform rodasse também para campo ausente, salvar só o domínio
  // apagaria a porta interna do container do app. Este teste fixa que não roda.
  const result: any = await run(UpdateAppDto, { domain: 'api.exemplo.com' });

  assert.equal(result.domain, 'api.exemplo.com');
  for (const field of [
    'branch',
    'envVars',
    'installCommand',
    'buildCommand',
    'migrateCommand',
    'startCommand',
    'appDir',
    'workspacePackage',
    'runtime',
    'containerPort',
    'dockerContext',
  ]) {
    assert.equal(result[field], undefined, `${field} não pode ganhar valor num update parcial`);
  }
});

test('UpdateAppDto rejeita campo desconhecido em vez de descartar em silêncio', async () => {
  const message = await expectRejection(UpdateAppDto, { envVars: 'A=1', naoExiste: 'x' });
  assert.match(message, /naoExiste/);
});

test('UpdateAppDto rejeita runtime fora da lista', async () => {
  const message = await expectRejection(UpdateAppDto, { runtime: 'kubernetes' });
  assert.match(message, /runtime/);
});

test('UpdateAppDto aceita os três runtimes válidos', async () => {
  for (const runtime of ['auto', 'pm2', 'docker']) {
    const result = await run(UpdateAppDto, { runtime });
    assert.equal(result.runtime, runtime);
  }
});

test('UpdateAppDto rejeita branch com caractere de shell', async () => {
  const message = await expectRejection(UpdateAppDto, { branch: 'main; rm -rf /' });
  assert.match(message, /branch/);
});

test('UpdateAppDto aceita branch com barra e ponto', async () => {
  const result = await run(UpdateAppDto, { branch: 'release/v1.2.3' });
  assert.equal(result.branch, 'release/v1.2.3');
});

test('UpdateAppDto converte containerPort vazio em null (limpar o campo)', async () => {
  const result = await run(UpdateAppDto, { containerPort: '' });
  assert.equal(result.containerPort, null);
  assert.ok('containerPort' in result, 'o campo precisa sobreviver para o service limpar a coluna');
});

test('UpdateAppDto converte containerPort em número', async () => {
  const result = await run(UpdateAppDto, { containerPort: '8080' });
  assert.equal(result.containerPort, 8080);
});

test('UpdateAppDto rejeita containerPort não numérico', async () => {
  const message = await expectRejection(UpdateAppDto, { containerPort: '8080abc' });
  assert.match(message, /containerPort/);
});

test('UpdateAppDto rejeita containerPort fora da faixa', async () => {
  assert.match(await expectRejection(UpdateAppDto, { containerPort: 0 }), /containerPort/);
  assert.match(await expectRejection(UpdateAppDto, { containerPort: 70000 }), /containerPort/);
});

// --- CreateAppDto -------------------------------------------------------------

test('CreateAppDto preserva os campos e converte a porta', async () => {
  const result = await run(CreateAppDto, {
    name: 'meu-app',
    type: 'nestjs',
    port: '3000',
    repository: 'git@github.com:acme/repo.git',
  });

  assert.equal(result.name, 'meu-app');
  assert.equal(result.type, 'nestjs');
  assert.equal(result.port, 3000);
  assert.equal(result.repository, 'git@github.com:acme/repo.git');
});

test('CreateAppDto rejeita tipo desconhecido', async () => {
  const message = await expectRejection(CreateAppDto, {
    name: 'meu-app',
    type: 'django',
    port: 3000,
    repository: 'git@github.com:acme/repo.git',
  });
  assert.match(message, /type/);
});

// --- helpers puros ------------------------------------------------------------

test('normalizeContainerPort trata vazio, null e undefined como null', () => {
  assert.equal(normalizeContainerPort(''), null);
  assert.equal(normalizeContainerPort('   '), null);
  assert.equal(normalizeContainerPort(null), null);
  assert.equal(normalizeContainerPort(undefined), null);
});

test('normalizeContainerPort converte string de dígitos e preserva número', () => {
  assert.equal(normalizeContainerPort('8080'), 8080);
  assert.equal(normalizeContainerPort(' 8080 '), 8080);
  assert.equal(normalizeContainerPort(3000), 3000);
});

test('normalizeContainerPort não coage valores ambíguos', () => {
  // Devolve o original para o IsInt reprovar, em vez de virar NaN ou um número errado.
  assert.equal(normalizeContainerPort('0x1f'), '0x1f');
  assert.equal(normalizeContainerPort('80.5'), '80.5');
  assert.equal(normalizeContainerPort('8080abc'), '8080abc');
});

test('normalizePort converte só string de dígitos', () => {
  assert.equal(normalizePort('3000'), 3000);
  assert.equal(normalizePort(3000), 3000);
  assert.equal(normalizePort('abc'), 'abc');
});

// --- Fase 2: validação do que alimenta comandos do sistema --------------------

test('CreateAppDto rejeita repositório que o git leria como flag', async () => {
  const message = await expectRejection(CreateAppDto, {
    name: 'meu-app',
    type: 'nestjs',
    port: 3000,
    repository: '--upload-pack=touch /tmp/pwned',
  });
  assert.match(message, /repository/);
});

test('CreateAppDto rejeita repositório com metacaractere de shell', async () => {
  for (const repository of [
    'git@github.com:x/y.git; id',
    'git@github.com:x/$(id).git',
    'file:///root/apps',
    '/root/apps/algum-app',
  ]) {
    const message = await expectRejection(CreateAppDto, {
      name: 'meu-app',
      type: 'nestjs',
      port: 3000,
      repository,
    });
    assert.match(message, /repository/, repository);
  }
});

test('CreateAppDto rejeita nome que viraria caminho ou comando', async () => {
  for (const name of ['../etc', 'Meu-App', 'app;rm -rf /', '-app', 'meu app']) {
    const message = await expectRejection(CreateAppDto, {
      name,
      type: 'nestjs',
      port: 3000,
      repository: 'git@github.com:x/y.git',
    });
    assert.match(message, /name/, name);
  }
});

test('CreateAppDto aceita as formas legítimas de repositório', async () => {
  for (const repository of [
    'git@github.com:estopassoli/deploy-hub.git',
    'https://github.com/estopassoli/deploy-hub.git',
  ]) {
    const result = await run(CreateAppDto, {
      name: 'meu-app',
      type: 'nestjs',
      port: 3000,
      repository,
    });
    assert.equal(result.repository, repository);
  }
});
