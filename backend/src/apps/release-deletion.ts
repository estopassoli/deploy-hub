/**
 * Regras para apagar uma release do disco.
 *
 * ## Por que isto é um módulo à parte
 *
 * Apagar release é um `rm -rf` rodando como root sobre um caminho vindo do banco. As
 * regras que decidem *se pode* não podem ficar embutidas num controller: elas precisam
 * de teste, e precisam ser as mesmas para a exclusão manual e para a limpeza em lote.
 *
 * ## As três recusas
 *
 * 1. **A release atual.** É a que está servindo tráfego. Apagá-la derruba o app e não
 *    há de onde voltar.
 * 2. **A release para onde o symlink `current` aponta**, mesmo que o banco diga outra
 *    coisa. Defesa em profundidade: `isCurrent` é um booleano que já se provou capaz de
 *    divergir do disco, e aqui o custo do erro é produção fora do ar.
 * 3. **Release sem caminho registrado.** Se o `path` está vazio, não há o que apagar no
 *    disco — apagar só a linha do banco criaria um diretório órfão que ninguém mais
 *    encontra.
 *
 * Módulo puro, testável pelo `node --test`.
 */

export interface DeletableRelease {
  id: string;
  version: string;
  path: string | null;
  isCurrent: boolean;
  status: string;
  createdAt: Date;
}

export type DeletionRefusal =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Pode apagar esta release?
 *
 * `currentTarget` é o caminho real para onde o symlink `current` aponta — passe `null`
 * quando não foi possível ler o link (aí vale só o que o banco diz).
 */
export function canDeleteRelease(
  release: DeletableRelease,
  currentTarget: string | null,
): DeletionRefusal {
  if (release.isCurrent) {
    return { allowed: false, reason: 'Esta é a release que está no ar. Faça rollback antes de apagá-la.' };
  }

  if (!release.path) {
    return { allowed: false, reason: 'Esta release não tem diretório registrado; não há o que apagar no disco.' };
  }

  if (currentTarget && normalize(release.path) === normalize(currentTarget)) {
    return {
      allowed: false,
      reason:
        'O symlink `current` aponta para esta release, embora o banco diga outra coisa. ' +
        'Apagar derrubaria o app — confira o estado do deploy antes.',
    };
  }

  return { allowed: true };
}

/** Remove barra final, para que `/a/b` e `/a/b/` comparem iguais. */
function normalize(caminho: string): string {
  return caminho.replace(/\/+$/, '');
}

/**
 * Quais releases apagar numa limpeza em lote.
 *
 * `keep` conta a partir da mais recente e **nunca** inclui a atual na conta: manter
 * "as 2 mais recentes" significa a atual mais as 2 seguintes, porque a atual não é uma
 * escolha — é obrigação.
 */
export function selectPrunable(
  releases: DeletableRelease[],
  options: { keep: number; currentTarget: string | null },
): { toDelete: DeletableRelease[]; kept: DeletableRelease[] } {
  const ordenadas = [...releases].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const toDelete: DeletableRelease[] = [];
  const kept: DeletableRelease[] = [];
  let mantidas = 0;

  for (const release of ordenadas) {
    const veredito = canDeleteRelease(release, options.currentTarget);

    if (!veredito.allowed) {
      kept.push(release);
      continue;
    }

    if (mantidas < options.keep) {
      mantidas++;
      kept.push(release);
      continue;
    }

    toDelete.push(release);
  }

  return { toDelete, kept };
}

/**
 * Separa, de uma seleção, o que pode e o que não pode ser apagado.
 *
 * Existe para a exclusão em lote: a tela manda um conjunto de ids e precisa receber
 * de volta **quais foram recusadas e por quê**, não um erro genérico. Apagar 9 de 10
 * em silêncio, deixando a décima sem explicação, é pior do que recusar tudo.
 *
 * `currentTargets` aceita vários caminhos porque um projeto monorepo tem um symlink
 * `current` por service: a release só é segura se não for o alvo de **nenhum** deles.
 */
export function selectDeletable(
  releases: DeletableRelease[],
  ids: string[],
  currentTargets: (string | null)[],
): { toDelete: DeletableRelease[]; refused: Array<{ release: DeletableRelease; reason: string }> } {
  const pedidos = new Set(ids);
  const alvos = currentTargets.filter((t): t is string => Boolean(t));

  const toDelete: DeletableRelease[] = [];
  const refused: Array<{ release: DeletableRelease; reason: string }> = [];

  for (const release of releases) {
    if (!pedidos.has(release.id)) continue;

    // Basta um symlink apontar para ela.
    const bloqueio = alvos
      .map((alvo) => canDeleteRelease(release, alvo))
      .find((v): v is { allowed: false; reason: string } => !v.allowed);

    const veredito = bloqueio ?? canDeleteRelease(release, null);

    if (veredito.allowed) toDelete.push(release);
    else refused.push({ release, reason: veredito.reason });
  }

  return { toDelete, refused };
}
