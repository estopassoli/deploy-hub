/**
 * DTOs de `/api/apps`.
 *
 * ## Por que os validadores são aplicados por chamada de função, e não com `@decorator`
 *
 * Os testes do backend rodam em `node --test` direto sobre os `.ts`, usando o
 * type-stripping nativo do Node. Esse modo **não consegue nem parsear** sintaxe de
 * decorator — `@IsString()` vira `SyntaxError: Invalid or unexpected token`. É a mesma
 * família de restrição já documentada nos planos do projeto ("só sintaxe apagável —
 * nada de `enum`, `namespace` ou parameter properties").
 *
 * Como um decorator de propriedade é só açúcar para `Dec(Classe.prototype, 'campo')`,
 * aplicar na mão produz **exatamente** o mesmo metadado em runtime — com a vantagem de
 * este arquivo poder ser importado pelos testes, que é a única forma de testar o
 * `ValidationPipe` contra o DTO de verdade em vez de contra uma réplica.
 *
 * ## O bug que isto corrige
 *
 * `main.ts` usa `ValidationPipe({ whitelist: true })`, que remove toda propriedade sem
 * metadado de validação. Enquanto `CreateAppDto`/`UpdateAppDto` não tinham validador
 * nenhum, o body de `PUT /api/apps/:id` chegava ao `AppsService.update` como `{}`: nada
 * era salvo e a API respondia 200. O painel mostrava "Configurações salvas!" e o env do
 * app continuava o antigo.
 */

import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Tipos de app aceitos hoje. A Fase 6 troca isto por um registro de presets. */
export const APP_TYPES = ['nestjs', 'nextjs', 'vitejs'] as const;

/** Preferência de runtime pedida pelo usuário (`activeRuntime` é escrito pelo deploy). */
export const APP_RUNTIMES = ['auto', 'pm2', 'docker'] as const;

/** Mesmo padrão de branch já usado por `UpdateProjectDto` em projects.controller.ts. */
export const BRANCH_PATTERN = /^[\w.\-/]+$/;

/** Maior comprimento possível de um FQDN. */
export const DOMAIN_MAX_LENGTH = 253;

export const CONTAINER_PORT_MIN = 1;
export const CONTAINER_PORT_MAX = 65535;

/**
 * Normaliza o que a UI manda em `containerPort` antes da validação.
 *
 * O campo é um `<Input>` de texto: vem `''` quando o usuário limpa, string numérica
 * quando preenche, e `null` quando o cliente quer explicitamente apagar o valor. Os três
 * viram `null` — que `AppsService.update` já traduz para "limpar a coluna". Qualquer
 * outra coisa passa adiante intacta para o `IsInt` reprovar com mensagem clara, em vez de
 * virar `NaN` silencioso (o `Number('8080abc')` do código antigo).
 */
export function normalizeContainerPort(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (trimmed === '') return null;
  // Só dígitos: evita que '0x1f', '80.5' ou ' 80 ' virem número por coerção frouxa.
  if (!/^\d+$/.test(trimmed)) return value;
  return Number(trimmed);
}

/** Converte string numérica em número para os campos `port` inteiros. */
export function normalizePort(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return value;
  return Number(trimmed);
}

export class UpdateAppDto {
  domain?: string;
  branch?: string;
  envVars?: string;
  installCommand?: string;
  buildCommand?: string;
  migrateCommand?: string;
  startCommand?: string;
  appDir?: string;
  workspacePackage?: string;
  runtime?: string;
  containerPort?: number | null;
  dockerContext?: string;
}

export class CreateAppDto {
  name: string;
  type: string;
  port: number;
  domain?: string;
  repository: string;
  branch?: string;
  appDir?: string;
  workspacePackage?: string;
}

// --- aplicação dos validadores -------------------------------------------------

type PropDecorator = (target: object, propertyKey: string) => void;

function apply(target: NewableFunction, key: string, ...decorators: PropDecorator[]): void {
  for (const decorate of decorators) decorate(target.prototype, key);
}

/** String opcional que pode vir vazia (`''` significa "limpar" no AppsService). */
function optionalText(maxLength = 4096): PropDecorator[] {
  return [IsOptional() as PropDecorator, IsString() as PropDecorator, MaxLength(maxLength) as PropDecorator];
}

/** `envVars` guarda um .env inteiro — precisa de folga bem maior que um comando. */
const ENV_VARS_MAX_LENGTH = 64 * 1024;

for (const field of [
  'installCommand',
  'buildCommand',
  'migrateCommand',
  'startCommand',
  'appDir',
  'workspacePackage',
  'dockerContext',
] as const) {
  apply(UpdateAppDto, field, ...optionalText());
}

apply(UpdateAppDto, 'envVars', ...optionalText(ENV_VARS_MAX_LENGTH));
apply(UpdateAppDto, 'domain', ...optionalText(DOMAIN_MAX_LENGTH));
apply(
  UpdateAppDto,
  'branch',
  IsOptional() as PropDecorator,
  IsString() as PropDecorator,
  Matches(BRANCH_PATTERN, {
    message: 'branch contém caracteres inválidos',
  }) as PropDecorator,
);
apply(
  UpdateAppDto,
  'runtime',
  IsOptional() as PropDecorator,
  IsIn(APP_RUNTIMES as unknown as string[], {
    message: `runtime deve ser um destes: ${APP_RUNTIMES.join(', ')}`,
  }) as PropDecorator,
);
apply(
  UpdateAppDto,
  'containerPort',
  Transform(({ value }) => normalizeContainerPort(value)) as PropDecorator,
  IsOptional() as PropDecorator,
  IsInt({ message: 'containerPort deve ser um número inteiro' }) as PropDecorator,
  Min(CONTAINER_PORT_MIN) as PropDecorator,
  Max(CONTAINER_PORT_MAX) as PropDecorator,
);

apply(CreateAppDto, 'name', IsString() as PropDecorator, MaxLength(100) as PropDecorator);
apply(CreateAppDto, 'repository', IsString() as PropDecorator, MaxLength(2048) as PropDecorator);
apply(
  CreateAppDto,
  'type',
  IsIn(APP_TYPES as unknown as string[], {
    message: `type deve ser um destes: ${APP_TYPES.join(', ')}`,
  }) as PropDecorator,
);
apply(
  CreateAppDto,
  'port',
  Transform(({ value }) => normalizePort(value)) as PropDecorator,
  IsInt({ message: 'port deve ser um número inteiro' }) as PropDecorator,
  Min(CONTAINER_PORT_MIN) as PropDecorator,
  Max(CONTAINER_PORT_MAX) as PropDecorator,
);
apply(CreateAppDto, 'domain', ...optionalText(DOMAIN_MAX_LENGTH));
apply(CreateAppDto, 'appDir', ...optionalText());
apply(CreateAppDto, 'workspacePackage', ...optionalText());
apply(
  CreateAppDto,
  'branch',
  IsOptional() as PropDecorator,
  IsString() as PropDecorator,
  Matches(BRANCH_PATTERN, { message: 'branch contém caracteres inválidos' }) as PropDecorator,
);
