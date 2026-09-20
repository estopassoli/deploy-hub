/**
 * Criptografa de uma vez todas as variáveis de ambiente que ainda estão em texto puro.
 *
 * A migração é transparente sem este script: um valor legado é lido como está e
 * recriptografado no próximo save. Mas "o próximo save" pode nunca acontecer para um app
 * que ninguém edita há meses, e é justamente o `.env` desse app que continuaria legível
 * num backup do SQLite. Rodar isto fecha a janela de uma vez.
 *
 * Idempotente: valores já criptografados são deixados como estão.
 *
 * Uso (a partir de backend/):
 *     node scripts/encrypt-env-vars.mjs            # aplica
 *     node scripts/encrypt-env-vars.mjs --dry-run  # só relata
 *
 * Importante: este script usa um PrismaClient **sem** o middleware de criptografia, de
 * propósito. Ele precisa enxergar e gravar o valor bruto da coluna.
 */

import { PrismaClient } from '@prisma/client';
import { encryptSecret, isEncrypted, parseEncryptionKey } from '../dist/common/crypto.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  let key;
  try {
    key = parseEncryptionKey(process.env.ENV_ENCRYPTION_KEY);
  } catch (error) {
    console.error(`\n❌ ${error.message}\n`);
    process.exit(1);
  }

  if (!key) {
    console.error(
      '\n❌ ENV_ENCRYPTION_KEY não está definida em backend/.env.\n' +
        '   Gere uma com:  openssl rand -hex 32\n' +
        '   Guarde-a bem: sem ela os valores criptografados não são recuperáveis.\n',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const resumo = { apps: 0, projetos: 0, jaCriptografados: 0 };

  try {
    const apps = await prisma.app.findMany({ select: { id: true, name: true, envVars: true } });
    for (const app of apps) {
      if (!app.envVars) continue;
      if (isEncrypted(app.envVars)) {
        resumo.jaCriptografados++;
        continue;
      }
      console.log(`  app     ${app.name}`);
      if (!dryRun) {
        await prisma.app.update({
          where: { id: app.id },
          data: { envVars: encryptSecret(app.envVars, key) },
        });
      }
      resumo.apps++;
    }

    const projetos = await prisma.project.findMany({ select: { id: true, name: true, envVars: true } });
    for (const projeto of projetos) {
      if (!projeto.envVars) continue;
      if (isEncrypted(projeto.envVars)) {
        resumo.jaCriptografados++;
        continue;
      }
      console.log(`  projeto ${projeto.name}`);
      if (!dryRun) {
        await prisma.project.update({
          where: { id: projeto.id },
          data: { envVars: encryptSecret(projeto.envVars, key) },
        });
      }
      resumo.projetos++;
    }
  } finally {
    await prisma.$disconnect();
  }

  const total = resumo.apps + resumo.projetos;
  if (total === 0) {
    console.log(
      resumo.jaCriptografados > 0
        ? `✓ Nada a fazer — ${resumo.jaCriptografados} valor(es) já estavam criptografados.`
        : '✓ Nada a fazer — nenhuma variável de ambiente cadastrada.',
    );
  } else if (dryRun) {
    console.log(`\n${total} valor(es) seriam criptografados (${resumo.apps} apps, ${resumo.projetos} projetos).`);
  } else {
    console.log(`\n✓ ${total} valor(es) criptografados (${resumo.apps} apps, ${resumo.projetos} projetos).`);
  }
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}\n`);
  process.exit(1);
});
