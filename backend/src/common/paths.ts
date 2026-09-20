/**
 * Guarda de caminho para operações destrutivas.
 *
 * ## Por que isto existe
 *
 * O painel apaga diretórios montados a partir de valores do banco:
 *
 *     execAsync(`rm -rf ${appDir}`)                  // APPS_DIR + app.name
 *     execAsync(`sudo rm -rf /var/www/${app.name}`)
 *     execAsync(`rm -rf ${deploy.path}`)             // cleanup diário, caminho do banco
 *
 * Rodando como root, um `name` ou `path` inesperado (`..`, `/`, caminho absoluto vindo
 * de uma linha antiga do banco) transforma uma limpeza de release em um `rm -rf` fora
 * de lugar. O `cleanup.service.ts` é o mais sensível: roda sozinho às 3h da manhã sobre
 * linhas que ninguém revisou.
 *
 * `assertInside` resolve o caminho de verdade (`path.resolve`, sem seguir symlink) e
 * recusa qualquer coisa que não esteja debaixo de uma raiz permitida. Módulo puro, sem
 * dependência do Nest, para ser testável pelo `node --test`.
 */

import * as path from 'path';

export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafePathError';
  }
}

/**
 * True quando `target` está dentro de `root` (ou é o próprio `root`).
 *
 * A comparação é feita sobre caminhos resolvidos e com separador no fim, para que
 * `/var/www-outro` não passe por estar dentro de `/var/www`.
 */
export function isInside(target: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);

  if (resolvedTarget === resolvedRoot) return true;

  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  return resolvedTarget.startsWith(rootWithSep);
}

/**
 * Garante que `target` está dentro de pelo menos uma das `roots` e devolve o caminho
 * resolvido. Lança `UnsafePathError` caso contrário.
 *
 * Também recusa a própria raiz: apagar `APPS_DIR` inteiro nunca é a intenção de uma
 * rotina que quer remover *um* app.
 */
export function assertInside(target: string, roots: string[], what = 'caminho'): string {
  if (typeof target !== 'string' || target.trim() === '') {
    throw new UnsafePathError(`${what} vazio — operação destrutiva recusada`);
  }

  const resolved = path.resolve(target);

  for (const root of roots) {
    const resolvedRoot = path.resolve(root);
    if (resolved === resolvedRoot) {
      throw new UnsafePathError(
        `${what} aponta para a própria raiz (${resolvedRoot}) — operação destrutiva recusada`,
      );
    }
    if (isInside(resolved, resolvedRoot)) return resolved;
  }

  throw new UnsafePathError(
    `${what} "${resolved}" está fora de ${roots.join(', ')} — operação destrutiva recusada`,
  );
}

/**
 * Nome de app/projeto seguro para virar um segmento de caminho, nome de processo PM2,
 * nome de container e nome de vhost do nginx.
 *
 * Mesmo padrão que `ServiceDto` já exigia no fluxo de projeto. Aplicado aqui também
 * para as linhas que já estão no banco, criadas antes dessa validação existir.
 */
export const SAFE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isSafeName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= 100 && SAFE_NAME_PATTERN.test(name);
}

/**
 * Valida o nome antes de usá-lo para montar um caminho destrutivo.
 *
 * Separado de `assertInside` porque pega o problema mais cedo e com mensagem melhor:
 * `/var/www/../../etc` até seria barrado pelo assertInside, mas o erro fica mais claro
 * dizendo que o nome é inválido.
 */
export function assertSafeName(name: unknown, what = 'nome'): string {
  if (!isSafeName(name)) {
    throw new UnsafePathError(
      `${what} inválido: ${JSON.stringify(name)} — esperado apenas minúsculas, números e hífen`,
    );
  }
  return name;
}
