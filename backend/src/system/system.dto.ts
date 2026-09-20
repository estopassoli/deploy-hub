/**
 * DTOs de `/api/system`.
 *
 * Escrito sem sintaxe de decorator pelo mesmo motivo descrito em `apps/apps.dto.ts`:
 * o `node --test` roda direto sobre os `.ts` e o type-stripping do Node não parseia
 * `@decorator`.
 *
 * Antes isto era uma `interface`, o que faz o `ValidationPipe` ignorar o body por
 * completo (o metatype vira `Object` em runtime). `emailRecipient` vai direto para o
 * campo `to:` de um email, então passou a ser validado de verdade.
 */

import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { RETENTION_DAYS_MAX, RETENTION_DAYS_MIN } from './settings.ts';

export class UpdateEmailSettingsDto {
  emailEnabled: boolean;
  emailRecipient?: string | null;
}

export class UpdateGeneralSettingsDto {
  retentionDays?: number;
  autoCleanup?: boolean;
}

type PropDecorator = (target: object, propertyKey: string) => void;

function apply(target: NewableFunction, key: string, ...decorators: PropDecorator[]): void {
  for (const decorate of decorators) decorate(target.prototype, key);
}

/** Aceita o booleano real e as strings 'true'/'false' que um form pode mandar. */
export function normalizeBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** `''` e `null` significam "sem destinatário" — não são um email inválido. */
export function normalizeRecipient(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

apply(
  UpdateEmailSettingsDto,
  'emailEnabled',
  Transform(({ value }) => normalizeBoolean(value)) as PropDecorator,
  IsBoolean() as PropDecorator,
);

apply(
  UpdateEmailSettingsDto,
  'emailRecipient',
  Transform(({ value }) => normalizeRecipient(value)) as PropDecorator,
  IsOptional() as PropDecorator,
  ValidateIf((o: UpdateEmailSettingsDto) => o.emailRecipient !== null) as PropDecorator,
  IsEmail({}, { message: 'emailRecipient deve ser um email válido' }) as PropDecorator,
  MaxLength(320) as PropDecorator,
);

apply(
  UpdateGeneralSettingsDto,
  'retentionDays',
  IsOptional() as PropDecorator,
  Transform(({ value }) => (typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value)) as PropDecorator,
  IsInt({ message: 'retentionDays deve ser um número inteiro' }) as PropDecorator,
  Min(RETENTION_DAYS_MIN) as PropDecorator,
  Max(RETENTION_DAYS_MAX) as PropDecorator,
);

apply(
  UpdateGeneralSettingsDto,
  'autoCleanup',
  IsOptional() as PropDecorator,
  Transform(({ value }) => normalizeBoolean(value)) as PropDecorator,
  IsBoolean() as PropDecorator,
);
