/**
 * Descobre quais migrations legadas precisam ser registradas em `_prisma_migrations`.
 *
 * ## Por que isto existe
 *
 * O `backend/setup.sh` criava o banco com `prisma db push`, e o `update.sh` atualizava
 * com `prisma db push`. Nenhum dos dois escreve em `_prisma_migrations`: o schema do
 * banco fica correto, mas o Prisma não sabe que aquelas migrations já estão refletidas
 * nele. Na primeira vez que se roda `prisma migrate deploy` nesse banco, ele tenta
 * aplicar tudo desde o começo e falha em `CREATE TABLE "User"` (já existe).
 *
 * A saída daqui é a lista de migrations que o `update.sh` deve marcar com
 * `prisma migrate resolve --applied`. Esse comando escreve **apenas** uma linha em
 * `_prisma_migrations` — não executa SQL de schema e não toca em nenhum dado.
 *
 * ## Por que a lista é fixa
 *
 * Só as seis migrations que já existiam quando o painel usava `db push` podem ser
 * baselinadas. Uma migration nova (Fase 3 em diante) nunca entra nesta lista, então
 * nunca corre o risco de ser marcada como aplicada sem ter rodado — que seria um jeito
 * silencioso de deixar o banco fora de sincronia com o schema.
 *
 * Uso:  node scripts/migration-baseline.mjs
 * Saída: um nome de migration por linha (vazio quando não há nada a fazer).
 */

import { PrismaClient } from '@prisma/client';

/** Migrations anteriores à adoção do `migrate deploy`. NÃO adicione migrations novas. */
const LEGACY_MIGRATIONS = [
  '20251207063844_init',
  '20260625105121_init',
  '20260716194238_add_monorepo_fields',
  '20260716200000_reconcile_app_drift',
  '20260716215020_add_projects',
  '20260811030000_add_docker_runtime',
];

async function main() {
  const prisma = new PrismaClient();

  try {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    );
    const tableNames = new Set(tables.map((row) => row.name));

    // Banco novo (sem a tabela App): não há o que baselinar — o `migrate deploy` vai
    // criar tudo do zero, na ordem certa.
    if (!tableNames.has('App')) return [];

    let applied = new Set();
    if (tableNames.has('_prisma_migrations')) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
      );
      applied = new Set(rows.map((row) => row.migration_name));
    }

    return LEGACY_MIGRATIONS.filter((name) => !applied.has(name));
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((pending) => {
    if (pending.length > 0) console.log(pending.join('\n'));
  })
  .catch((error) => {
    // Falhar silencioso aqui seria pior que não baselinar: o update.sh trata saída
    // não-zero como "não sei dizer" e segue para o migrate deploy, que dá a mensagem
    // de erro completa do Prisma.
    console.error(`[migration-baseline] ${error.message}`);
    process.exit(1);
  });
