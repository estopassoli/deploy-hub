import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENCRYPTED_PREFIX, decryptSecret, encryptSecret, isEncrypted } from '../common/crypto.ts';
import { createEnvEncryptionMiddleware } from './env-encryption.ts';

const KEY = randomBytes(32);
const ENV = 'DATABASE_URL=postgres://user:senha@host/db\nAPI_KEY=abc';

/** Executa o middleware capturando o que chegaria ao Prisma e devolvendo `result`. */
async function through(
  params: { model?: string; action: string; args?: any },
  result: unknown,
  key: Buffer | null = KEY,
) {
  const middleware = createEnvEncryptionMiddleware(key);
  let recebido: any = null;
  const completos = { dataPath: [], runInTransaction: false, ...params };
  const saida = await middleware(completos, async (p) => {
    recebido = p;
    return result;
  });
  return { enviadoAoPrisma: recebido, resultado: saida };
}

// --- escrita ------------------------------------------------------------------

test('criptografa envVars num create simples', async () => {
  const { enviadoAoPrisma } = await through(
    { model: 'App', action: 'create', args: { data: { name: 'app', envVars: ENV } } },
    {},
  );
  const gravado = enviadoAoPrisma.args.data.envVars;
  assert.ok(isEncrypted(gravado), 'deveria chegar criptografado no banco');
  assert.doesNotMatch(gravado, /senha/);
  assert.equal(decryptSecret(gravado, KEY), ENV);
  assert.equal(enviadoAoPrisma.args.data.name, 'app', 'outros campos ficam intactos');
});

test('criptografa envVars num update', async () => {
  const { enviadoAoPrisma } = await through(
    { model: 'App', action: 'update', args: { where: { id: '1' }, data: { envVars: ENV } } },
    {},
  );
  assert.ok(isEncrypted(enviadoAoPrisma.args.data.envVars));
  assert.deepEqual(enviadoAoPrisma.args.where, { id: '1' }, 'where não é tocado');
});

test('criptografa envVars de services num create aninhado', async () => {
  // É assim que projects.service.create grava projeto + services numa chamada só.
  const { enviadoAoPrisma } = await through(
    {
      model: 'Project',
      action: 'create',
      args: {
        data: {
          name: 'monorepo',
          envVars: 'REDIS_URL=redis://x',
          apps: {
            create: [
              { name: 'api', envVars: 'PORT=4000' },
              { name: 'web', envVars: 'NEXT_PUBLIC_API=/api' },
            ],
          },
        },
      },
    },
    {},
  );

  const data = enviadoAoPrisma.args.data;
  assert.ok(isEncrypted(data.envVars), 'env do projeto');
  assert.equal(decryptSecret(data.envVars, KEY), 'REDIS_URL=redis://x');
  for (const [i, esperado] of [['PORT=4000'], ['NEXT_PUBLIC_API=/api']].entries()) {
    const app = data.apps.create[i];
    assert.ok(isEncrypted(app.envVars), `env do service ${i}`);
    assert.equal(decryptSecret(app.envVars, KEY), esperado[0]);
  }
  assert.equal(data.apps.create[0].name, 'api', 'demais campos do aninhado intactos');
});

test('criptografa o envelope { set: ... }', async () => {
  const { enviadoAoPrisma } = await through(
    { model: 'App', action: 'update', args: { data: { envVars: { set: ENV } } } },
    {},
  );
  assert.ok(isEncrypted(enviadoAoPrisma.args.data.envVars.set));
});

test('criptografa os dois blocos de um upsert', async () => {
  const { enviadoAoPrisma } = await through(
    {
      model: 'App',
      action: 'upsert',
      args: { where: { id: '1' }, create: { envVars: 'A=1' }, update: { envVars: 'B=2' } },
    },
    {},
  );
  assert.equal(decryptSecret(enviadoAoPrisma.args.create.envVars, KEY), 'A=1');
  assert.equal(decryptSecret(enviadoAoPrisma.args.update.envVars, KEY), 'B=2');
});

test('não recriptografa um valor que já veio criptografado', async () => {
  const jaCriptografado = encryptSecret(ENV, KEY);
  const { enviadoAoPrisma } = await through(
    { model: 'App', action: 'update', args: { data: { envVars: jaCriptografado } } },
    {},
  );
  assert.equal(enviadoAoPrisma.args.data.envVars, jaCriptografado);
});

test('null e undefined em envVars passam intactos', async () => {
  // `''` vira null no AppsService antes de chegar aqui; null significa "limpar".
  const { enviadoAoPrisma } = await through(
    { model: 'App', action: 'update', args: { data: { envVars: null, domain: 'x.com' } } },
    {},
  );
  assert.equal(enviadoAoPrisma.args.data.envVars, null);
});

// --- leitura ------------------------------------------------------------------

test('decriptografa envVars num findUnique', async () => {
  const { resultado } = await through(
    { model: 'App', action: 'findUnique', args: { where: { id: '1' } } },
    { id: '1', name: 'app', envVars: encryptSecret(ENV, KEY) },
  );
  assert.equal((resultado as any).envVars, ENV);
});

test('decriptografa envVars em lista e em include aninhado', async () => {
  const { resultado } = await through(
    { model: 'Project', action: 'findMany', args: { include: { apps: true } } },
    [
      {
        id: 'p1',
        envVars: encryptSecret('REDIS_URL=redis://x', KEY),
        apps: [
          { id: 'a1', envVars: encryptSecret('PORT=4000', KEY) },
          { id: 'a2', envVars: null },
        ],
      },
    ],
  );

  const projeto = (resultado as any[])[0];
  assert.equal(projeto.envVars, 'REDIS_URL=redis://x');
  assert.equal(projeto.apps[0].envVars, 'PORT=4000');
  assert.equal(projeto.apps[1].envVars, null);
});

test('valor legado em texto puro é devolvido como está', async () => {
  // Migração transparente: linhas gravadas antes desta mudança.
  const { resultado } = await through(
    { model: 'App', action: 'findFirst' },
    { id: '1', envVars: 'DATABASE_URL=legado' },
  );
  assert.equal((resultado as any).envVars, 'DATABASE_URL=legado');
});

test('resultado sem envVars e tipos especiais passam ilesos', async () => {
  const criadoEm = new Date('2026-01-01T00:00:00Z');
  const { resultado } = await through(
    { model: 'App', action: 'findFirst' },
    { id: '1', createdAt: criadoEm, port: 3000, domain: null },
  );
  assert.equal((resultado as any).createdAt, criadoEm);
  assert.equal((resultado as any).port, 3000);
});

// --- sem chave ----------------------------------------------------------------

test('sem chave configurada, nada é criptografado nem quebrado', async () => {
  // Instalações que ainda não geraram ENV_ENCRYPTION_KEY continuam funcionando.
  const { enviadoAoPrisma, resultado } = await through(
    { model: 'App', action: 'update', args: { data: { envVars: ENV } } },
    { envVars: ENV },
    null,
  );
  assert.equal(enviadoAoPrisma.args.data.envVars, ENV);
  assert.equal((resultado as any).envVars, ENV);
});

// --- modelos sem campo criptografado -----------------------------------------

test('modelos sem envVars passam direto', async () => {
  const { enviadoAoPrisma, resultado } = await through(
    { model: 'User', action: 'create', args: { data: { email: 'a@b.c', password: 'hash' } } },
    { id: '1', password: 'hash' },
  );
  assert.equal(enviadoAoPrisma.args.data.password, 'hash');
  assert.equal((resultado as any).password, 'hash');
});

test('a senha do usuário nunca é tocada pelo middleware', async () => {
  const { resultado } = await through(
    { model: 'User', action: 'findUnique' },
    { id: '1', password: `${ENCRYPTED_PREFIX}nao-mexer` },
  );
  assert.equal((resultado as any).password, `${ENCRYPTED_PREFIX}nao-mexer`);
});

// --- o middleware não pode destruir valores que não são objeto literal -----------

test('Date sobrevive à passagem pelo middleware', async () => {
  /*
   * O bug que isto fixa: `typeof new Date() === 'object'`, então a travessia recursava
   * no Date e o reconstruía com `{ ...valor }` — que dá `{}`, porque Date não tem
   * propriedade própria enumerável. Em produção, toda checagem de uptime falhava com
   * "Argument `lastUptimeAt`: Expected DateTime, provided Object".
   */
  const middleware = createEnvEncryptionMiddleware(randomBytes(32));
  const quando = new Date('2026-09-21T06:35:01.000Z');

  let recebido: any;
  await middleware(
    {
      model: 'App',
      action: 'update',
      args: { where: { id: 'x' }, data: { lastUptimeStatus: 'down', lastUptimeAt: quando } },
      dataPath: [],
      runInTransaction: false,
    } as any,
    async (params: any) => {
      recebido = params.args.data;
      return {};
    },
  );

  assert.ok(recebido.lastUptimeAt instanceof Date, 'deveria continuar sendo Date');
  assert.equal(recebido.lastUptimeAt.toISOString(), quando.toISOString());
  assert.equal(recebido.lastUptimeStatus, 'down');
});

test('Date aninhada em create também sobrevive', async () => {
  const middleware = createEnvEncryptionMiddleware(randomBytes(32));
  const quando = new Date('2026-09-21T00:00:00.000Z');

  let recebido: any;
  await middleware(
    {
      model: 'Project',
      action: 'create',
      args: { data: { name: 'p', envVars: 'A=1', apps: { create: [{ name: 'a', lastUptimeAt: quando }] } } },
      dataPath: [],
      runInTransaction: false,
    } as any,
    async (params: any) => {
      recebido = params.args.data;
      return {};
    },
  );

  assert.ok(recebido.apps.create[0].lastUptimeAt instanceof Date);
  // E a criptografia do campo vizinho continua acontecendo.
  assert.equal(isEncrypted(recebido.envVars), true);
});

test('Buffer não vira objeto vazio', async () => {
  const middleware = createEnvEncryptionMiddleware(randomBytes(32));
  const bytes = Buffer.from('conteudo');

  let recebido: any;
  await middleware(
    { model: 'App', action: 'update', args: { where: { id: 'x' }, data: { blob: bytes } }, dataPath: [], runInTransaction: false } as any,
    async (params: any) => {
      recebido = params.args.data;
      return {};
    },
  );

  assert.ok(Buffer.isBuffer(recebido.blob));
  assert.equal(recebido.blob.toString(), 'conteudo');
});
