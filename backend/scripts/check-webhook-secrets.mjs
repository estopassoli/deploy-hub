/**
 * Lista os apps sem `webhookSecret`.
 *
 * Desde a Fase 7 o webhook recusa (401) uma requisição que não pode autenticar. Todo
 * caminho de criação de app gera um segredo, então só linhas antigas podem estar sem —
 * mas para essas o webhook pararia de funcionar sem aviso nenhum, e o sintoma seria
 * "o deploy automático simplesmente parou".
 *
 * Este script roda no `update.sh` para que o operador saiba **antes** de o webhook
 * falhar, e não depois. Imprime um nome de app por linha; nada em stdout significa que
 * está tudo certo.
 *
 * Nunca imprime o segredo de ninguém — só o nome de quem não tem.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const apps = await prisma.app.findMany({
    where: { OR: [{ webhookSecret: null }, { webhookSecret: '' }] },
    select: { name: true },
    orderBy: { name: 'asc' },
  });

  for (const app of apps) process.stdout.write(`${app.name}\n`);
} catch (error) {
  // Falhar aqui não pode derrubar o update: é um aviso, não um passo obrigatório.
  process.stderr.write(`check-webhook-secrets: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
