/**
 * Leitura dos eventos de branch que o GitHub manda no webhook.
 *
 * ## Por que não basta olhar `push`
 *
 * O webhook do painel só tratava `push` na branch configurada do app; qualquer outra
 * coisa virava "evento ignorado". Para preview por branch são necessários três sinais,
 * e o GitHub os entrega de formas diferentes:
 *
 * | Situação | Evento | Como reconhecer |
 * |---|---|---|
 * | Push numa branch | `push` | `ref: refs/heads/<branch>`, `deleted: false` |
 * | Branch criada | `create` | `ref_type: 'branch'`, `ref: <branch>` (sem prefixo) |
 * | Branch apagada | `delete` | `ref_type: 'branch'`, `ref: <branch>` (sem prefixo) |
 * | Branch apagada | `push` | `deleted: true` — o push "vazio" que remove a ref |
 *
 * As duas últimas linhas são o mesmo fato chegando por dois caminhos: dependendo de como
 * a branch foi apagada, e de quais eventos estão assinados no webhook, chega `delete`,
 * chega um `push` com `deleted: true`, ou chegam os dois. Tratar só um deles deixa
 * preview órfão ocupando porta e disco — por isso ambos mapeiam para `delete`, e
 * `PreviewService.destroy` é idempotente para o caso de chegarem os dois.
 *
 * Um `create` de branch **não** sobe preview sozinho: uma branch recém-criada aponta
 * para o mesmo commit da base, e subir um ambiente idêntico à produção gasta porta e
 * uma emissão de certificado sem entregar nada. O preview nasce no primeiro push.
 *
 * Módulo puro, testável pelo `node --test`.
 */

export type BranchEventKind = 'push' | 'delete' | 'ignore';

export interface BranchEvent {
  kind: BranchEventKind;
  /** Nome da branch, sem `refs/heads/`. Vazio quando `kind` é `ignore`. */
  branch: string;
  /** Motivo de ter sido ignorado, para o corpo da resposta ao GitHub. */
  reason?: string;
}

/** `refs/heads/feat/login` → `feat/login`. Tags e outras refs devolvem vazio. */
export function branchFromRef(ref: unknown): string {
  const valor = typeof ref === 'string' ? ref.trim() : '';
  if (!valor) return '';
  if (valor.startsWith('refs/heads/')) return valor.slice('refs/heads/'.length);
  // Eventos `create`/`delete` mandam o nome puro; qualquer outra ref (`refs/tags/...`)
  // não é branch.
  if (valor.startsWith('refs/')) return '';
  return valor;
}

export function parseBranchEvent(event: string, payload: any): BranchEvent {
  const tipo = (event || '').trim().toLowerCase();
  const dados = payload ?? {};

  if (tipo === 'push') {
    const branch = branchFromRef(dados.ref);
    if (!branch) return { kind: 'ignore', branch: '', reason: 'Push fora de uma branch' };

    // O push que apaga a ref vem com `deleted: true` e `after` todo zerado.
    const apagada =
      dados.deleted === true || /^0{40}$/.test(typeof dados.after === 'string' ? dados.after : '');

    return { kind: apagada ? 'delete' : 'push', branch };
  }

  if (tipo === 'delete') {
    if (dados.ref_type !== 'branch') {
      return { kind: 'ignore', branch: '', reason: `Delete de ${dados.ref_type ?? 'ref'} ignorado` };
    }
    const branch = branchFromRef(dados.ref);
    return branch
      ? { kind: 'delete', branch }
      : { kind: 'ignore', branch: '', reason: 'Delete sem nome de branch' };
  }

  if (tipo === 'create') {
    // Deliberado: branch criada não sobe preview. Ver o cabeçalho.
    return { kind: 'ignore', branch: '', reason: 'Branch criada; o preview sobe no primeiro push' };
  }

  return { kind: 'ignore', branch: '', reason: `Evento ${event} ignorado` };
}
