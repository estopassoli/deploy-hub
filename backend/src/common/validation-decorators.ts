/**
 * Decorators de validação para os campos que alimentam comandos do sistema.
 *
 * Escrito com `registerDecorator` em vez de sintaxe `@decorator` (veja o cabeçalho de
 * `apps/apps.dto.ts` para o motivo), mas o resultado é usável normalmente como
 * `@IsSafeRepositoryUrl()` nos controllers, que são compilados pelo nest build.
 */

// `import type` separado: ValidationOptions é uma interface, e o type-stripping do
// Node mantém o import nomeado em runtime se ele vier junto com um valor — a
// class-validator não exporta esse nome em runtime, e o teste quebra.
import { registerDecorator } from 'class-validator';
import type { ValidationOptions } from 'class-validator';
import {
  DOMAIN_MESSAGE,
  REPOSITORY_MESSAGE,
  isSafeDomain,
  isSafeRepositoryUrl,
} from './validation.ts';

type PropDecorator = (target: object, propertyKey: string) => void;

function build(
  name: string,
  validate: (value: unknown) => boolean,
  message: string,
  options?: ValidationOptions,
): PropDecorator {
  return (target: object, propertyKey: string) => {
    registerDecorator({
      name,
      target: target.constructor,
      propertyName: propertyKey,
      options: { message, ...options },
      validator: { validate: (value: unknown) => validate(value) },
    });
  };
}

/** Aceita apenas `git@host:usuario/repo.git` ou `https://host/usuario/repo.git`. */
export function IsSafeRepositoryUrl(options?: ValidationOptions): PropDecorator {
  return build('isSafeRepositoryUrl', isSafeRepositoryUrl, REPOSITORY_MESSAGE, options);
}

/** Aceita apenas um hostname (sem esquema, sem porta, sem caminho). */
export function IsSafeDomain(options?: ValidationOptions): PropDecorator {
  return build('isSafeDomain', isSafeDomain, DOMAIN_MESSAGE, options);
}
