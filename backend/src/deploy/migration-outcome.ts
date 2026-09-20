/**
 * Classificação do resultado de um comando de migration.
 *
 * ## O bug que isto corrige
 *
 * O pipeline fazia:
 *
 *     try { await this.runCommand(migrateCmd, ...) }
 *     catch { this.log('  ⚠ No migrations to apply or error') }
 *
 * "Nenhuma migration a aplicar **ou** erro" — as duas coisas tratadas igual, e o deploy
 * seguia em frente nos dois casos. Uma migration que falha por conflito, por coluna
 * duplicada ou por banco fora do ar deixava o deploy trocar o symlink e subir o app
 * contra um schema que não bate com o código. O sintoma aparece minutos depois, como
 * erro em runtime, longe da causa.
 *
 * ## Como classificar
 *
 * O caminho feliz é simples: saída 0 é sucesso. O cuidado está no código != 0.
 *
 * O comando pode ser o padrão (`prisma migrate deploy`) ou um comando que o usuário
 * digitou no painel — então não dá para assumir o formato da saída. A regra é
 * conservadora: só é tratado como "nada a aplicar" o que casar com uma assinatura
 * conhecida e inequívoca. Qualquer outra coisa **falha o deploy**, que é o
 * comportamento seguro.
 */

export type MigrationOutcome = 'applied' | 'nothing-to-apply' | 'failed';

/**
 * Assinaturas de "não havia nada para fazer", de ferramentas que saem com código != 0
 * nesse caso.
 *
 * `prisma migrate deploy` sai com 0 quando não há pendências, então nem precisaria
 * estar aqui — mas a mensagem é reconhecida assim mesmo, para o log do deploy poder
 * dizer "nada a aplicar" em vez de "aplicado".
 */
const NOTHING_TO_APPLY_PATTERNS: RegExp[] = [
  /no pending migrations/i,
  /no migrations? (were |to be )?(found|applied|pending)/i,
  /already in sync/i,
  /database schema is up to date/i,
  /nothing to migrate/i,
  /no new migrations/i,
  /não há migrations pendentes/i,
];

/**
 * Sinais de erro real que podem aparecer numa saída que também contenha alguma das
 * frases acima. Têm prioridade: uma saída com "No pending migrations" seguida de
 * "Error: connect ECONNREFUSED" é erro, não sucesso.
 */
const HARD_FAILURE_PATTERNS: RegExp[] = [
  /\bP\d{4}\b/, // códigos de erro do Prisma (P1001, P3006, ...)
  /migration (failed|engine error)/i,
  /econnrefused|etimedout|enotfound/i,
  /permission denied/i,
  /syntax error/i,
];

export function classifyMigrationOutcome(exitCode: number, output: string): MigrationOutcome {
  const text = output || '';

  if (exitCode === 0) {
    return NOTHING_TO_APPLY_PATTERNS.some((pattern) => pattern.test(text))
      ? 'nothing-to-apply'
      : 'applied';
  }

  if (HARD_FAILURE_PATTERNS.some((pattern) => pattern.test(text))) return 'failed';
  if (NOTHING_TO_APPLY_PATTERNS.some((pattern) => pattern.test(text))) return 'nothing-to-apply';

  // Saída != 0 sem assinatura reconhecida: falha. É o lado seguro do trade-off —
  // parar um deploy que talvez estivesse ok custa um clique; seguir com um schema
  // desatualizado derruba o app em produção.
  return 'failed';
}

/** Mensagem para o log do deploy. */
export function describeMigrationOutcome(outcome: MigrationOutcome): string {
  switch (outcome) {
    case 'applied':
      return '✓ Migrations aplicadas';
    case 'nothing-to-apply':
      return '  Nenhuma migration pendente';
    case 'failed':
      return '❌ Migration falhou';
  }
}
