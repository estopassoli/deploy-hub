/**
 * Middleware do Prisma que criptografa `envVars` na escrita e decriptografa na leitura.
 *
 * ## Por que middleware, e não chamadas explícitas nos services
 *
 * `envVars` é lido e escrito em uns doze pontos espalhados por `deploy.service`,
 * `apps.service`, `projects.service` e nas respostas da API. Esquecer **um** ponto de
 * escrita gravaria segredo em texto puro achando que estava protegido; esquecer **um**
 * ponto de leitura subiria um app de produção com o ciphertext no lugar do `.env`.
 * Interceptar na borda do Prisma elimina as duas classes de erro de uma vez, inclusive
 * para código novo que ainda nem existe.
 *
 * ## Casos que precisam de cuidado
 *
 * - **Create aninhado.** `projects.service.create` grava o projeto e os services numa
 *   chamada só (`data.apps.create[]`), cada um com o seu próprio `envVars`. Por isso a
 *   escrita percorre o `data` inteiro em vez de olhar só o nível de cima.
 * - **Include.** `findUnique({ include: { apps: true } })` devolve `envVars` em dois
 *   níveis. Por isso a leitura percorre o resultado inteiro.
 * - **Valor legado.** Linhas gravadas antes desta mudança estão em texto puro;
 *   `decryptSecret` as devolve como estão e elas são recriptografadas no próximo save.
 *
 * O `$use` está deprecado em favor de `$extends`, mas `$extends` devolve um **novo**
 * client, o que quebraria o `PrismaService extends PrismaClient` que todo o projeto
 * injeta. Trocar isso é uma refatoração de outra ordem; fica como dívida anotada.
 */

import { decryptSecret, encryptSecret } from '../common/crypto.ts';

/** Campos criptografados, por modelo. */
const ENCRYPTED_FIELDS = new Set(['envVars']);

/** Modelos que possuem algum campo criptografado. */
const ENCRYPTED_MODELS = new Set(['App', 'Project']);

/**
 * Mesmo formato de `Prisma.MiddlewareParams`, redeclarado aqui para o arquivo não
 * depender de tipos gerados — o `node --test` importa este módulo direto.
 * `dataPath` e `runInTransaction` não são usados, mas precisam existir para o
 * middleware ser atribuível ao que o `$use` espera.
 */
type PrismaMiddlewareParams = {
  model?: string;
  action: string;
  args?: any;
  dataPath: string[];
  runInTransaction: boolean;
};

type PrismaMiddleware = (
  params: PrismaMiddlewareParams,
  next: (params: PrismaMiddlewareParams) => Promise<any>,
) => Promise<any>;

/** Ações que carregam dados de escrita em `args.data`. */
const WRITE_ACTIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
]);

/**
 * Percorre um objeto de escrita aplicando `transform` em todo campo criptografado.
 *
 * Cobre as formas que o Prisma aceita: valor direto (`envVars: 'A=1'`), o envelope
 * `{ set: 'A=1' }`, arrays (`createMany.data`) e blocos aninhados
 * (`apps: { create: [...] }`).
 */
/**
 * Só objeto literal é percorrido.
 *
 * `typeof x === 'object'` é verdadeiro para `Date`, `Buffer`, `Decimal` e qualquer
 * instância de classe. Recursar neles e reconstruí-los com `{ ...valor }` produz um
 * objeto vazio: um `Date` não tem propriedades próprias enumeráveis.
 *
 * O efeito disso em produção foi silencioso e real — `lastUptimeAt: new Date()`
 * chegava ao Prisma como `{}` e toda checagem de uptime falhava com "Expected
 * DateTime, provided Object". O mesmo valeria para `sslExpiresAt` e qualquer data
 * gravada em App ou Project.
 */
function ehObjetoSimples(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walkWriteData(value: unknown, transform: (text: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => walkWriteData(item, transform));
  }

  if (!ehObjetoSimples(value)) return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = { ...source };

  for (const [key, item] of Object.entries(source)) {
    if (ENCRYPTED_FIELDS.has(key)) {
      if (typeof item === 'string') {
        result[key] = transform(item);
      } else if (item && typeof item === 'object' && typeof (item as any).set === 'string') {
        result[key] = { ...(item as object), set: transform((item as any).set) };
      }
      continue;
    }

    if (Array.isArray(item) || ehObjetoSimples(item)) {
      result[key] = walkWriteData(item, transform);
    }
  }

  return result;
}

/**
 * Percorre um resultado aplicando `transform` em todo campo criptografado.
 *
 * Diferente da escrita, aqui o objeto é mutado no lugar: o resultado do Prisma pode
 * carregar propriedades não enumeráveis e clonar perderia informação.
 */
function walkResult(value: unknown, transform: (text: string) => string): void {
  if (Array.isArray(value)) {
    for (const item of value) walkResult(item, transform);
    return;
  }

  if (!value || typeof value !== 'object') return;
  if (value instanceof Date || Buffer.isBuffer(value)) return;

  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (ENCRYPTED_FIELDS.has(key) && typeof item === 'string') {
      record[key] = transform(item);
    } else if (item && typeof item === 'object') {
      walkResult(item, transform);
    }
  }
}

/**
 * Cria o middleware. `key` nulo desliga a criptografia — as leituras continuam
 * funcionando (valores legados em texto puro passam direto), o que mantém instalações
 * sem `ENV_ENCRYPTION_KEY` no ar.
 */
export function createEnvEncryptionMiddleware(key: Buffer | null): PrismaMiddleware {
  return async (params, next) => {
    const touchesEncryptedModel = !params.model || ENCRYPTED_MODELS.has(params.model);
    if (!touchesEncryptedModel) return next(params);

    let effectiveParams = params;

    if (key && WRITE_ACTIONS.has(params.action) && params.args) {
      const args = { ...params.args };
      if (args.data !== undefined) args.data = walkWriteData(args.data, (text) => encryptSecret(text, key));
      // upsert tem dois blocos de escrita.
      if (args.create !== undefined) args.create = walkWriteData(args.create, (text) => encryptSecret(text, key));
      if (args.update !== undefined) args.update = walkWriteData(args.update, (text) => encryptSecret(text, key));
      effectiveParams = { ...params, args };
    }

    const result = await next(effectiveParams);

    // A decriptação roda mesmo sem chave configurada? Não: sem chave não há como
    // decriptografar, e valores legados em texto puro não precisam de nada. Com chave,
    // `decryptSecret` deixa passar o que não tem o prefixo.
    if (key) {
      walkResult(result, (text) => decryptSecret(text, key));
    }

    return result;
  };
}
