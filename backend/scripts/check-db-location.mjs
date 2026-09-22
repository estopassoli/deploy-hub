/**
 * Recusa migrar quando existe um banco com dados **fora** do caminho canônico.
 *
 * ## O incidente que isto evita
 *
 * O `schema.prisma` declara `url = "file:./deployhub.db"`, e o Prisma resolve esse
 * caminho relativo à **pasta do schema** — `backend/prisma/`. Uma instalação antiga
 * deste painel guardava o banco em `backend/deployhub.db`, um nível acima.
 *
 * Nessa situação o `prisma migrate deploy` não encontra banco no lugar que ele
 * considera canônico, **cria um vazio** e aplica as 13 migrations nele. Tudo responde
 * "sucesso": o update termina sem erro, o backend sobe, e o operador descobre pelo
 * login recusado que o painel está vendo um banco sem usuário, sem app e sem
 * histórico. Os dados continuam no disco, intactos, no arquivo antigo — mas nada na
 * tela sugere isso.
 *
 * Aconteceu em produção. O custo de detectar aqui é ler dois arquivos; o de não
 * detectar é um operador achando que perdeu 65 deploys e 13 apps.
 *
 * ## O que este script faz
 *
 * Procura arquivos `.db` fora do caminho canônico, conta linhas em cada um e compara.
 * Sai com código 1 — parando o update — quando o banco de fora tem dados e o canônico
 * não. Não corrige nada sozinho: mover banco de produção é decisão de quem opera, e o
 * script imprime os comandos exatos.
 *
 * Uso:  node scripts/check-db-location.mjs
 * Saída: nada e código 0 quando está tudo certo.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = path.join(BACKEND, 'prisma', 'schema.prisma');

/** Caminho do arquivo SQLite que o Prisma vai abrir, resolvido como ele resolve. */
function canonicalDbPath() {
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const match = schema.match(/url\s*=\s*"file:([^"]+)"/);
  if (!match) return null;

  const declarado = match[1];
  // Relativo é relativo à pasta do schema, não ao cwd — é exatamente essa regra que
  // produziu o incidente.
  return path.isAbsolute(declarado) ? declarado : path.resolve(BACKEND, 'prisma', declarado);
}

/** Quantas linhas úteis o banco tem. `null` quando o arquivo não é um banco do painel. */
async function contarLinhas(arquivo) {
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${arquivo}` } } });
  try {
    const [users, apps, deploys] = await Promise.all([
      prisma.user.count(),
      prisma.app.count(),
      prisma.deploy.count(),
    ]);
    return { users, apps, deploys, total: users + apps + deploys };
  } catch {
    return null;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

/** Candidatos: `.db` em backend/ e na raiz do repositório, fora do canônico. */
function candidatos(canonico) {
  const pastas = [BACKEND, path.resolve(BACKEND, '..')];
  const achados = [];

  for (const pasta of pastas) {
    let entradas = [];
    try {
      entradas = fs.readdirSync(pasta);
    } catch {
      continue;
    }

    for (const nome of entradas) {
      if (!nome.endsWith('.db')) continue;
      const completo = path.join(pasta, nome);
      if (completo === canonico) continue;
      try {
        if (fs.statSync(completo).isFile()) achados.push(completo);
      } catch {
        /* sumiu entre o readdir e o stat */
      }
    }
  }

  return achados;
}

const canonico = canonicalDbPath();
if (!canonico) process.exit(0);

const forasteiros = candidatos(canonico);
if (forasteiros.length === 0) process.exit(0);

const doCanonico = fs.existsSync(canonico) ? await contarLinhas(canonico) : null;
const comDados = [];

for (const arquivo of forasteiros) {
  const contagem = await contarLinhas(arquivo);
  if (contagem && contagem.total > 0) comDados.push({ arquivo, contagem });
}

if (comDados.length === 0) process.exit(0);

// Canônico já tem mais dados que qualquer forasteiro: o de fora é resto antigo.
const maiorForasteiro = Math.max(...comDados.map((c) => c.contagem.total));
if (doCanonico && doCanonico.total >= maiorForasteiro) process.exit(0);

const resumo = (c) => `${c.users} usuário(s), ${c.apps} app(s), ${c.deploys} deploy(s)`;

console.error('');
console.error('  Existe um banco com dados FORA do caminho que o Prisma usa.');
console.error('');
console.error(`  O Prisma vai abrir:  ${canonico}`);
console.error(
  doCanonico
    ? `    -> contém ${resumo(doCanonico)}`
    : '    -> não existe ainda; migrar agora criaria um banco VAZIO aqui',
);
console.error('');
for (const { arquivo, contagem } of comDados) {
  console.error(`  Banco com dados:     ${arquivo}`);
  console.error(`    -> contém ${resumo(contagem)}`);
}
console.error('');
console.error('  Seguir com a migração deixaria o painel abrindo o banco errado: login');
console.error('  recusado, nenhum app na tela, e os dados intactos num arquivo que a');
console.error('  interface não mostra.');
console.error('');
console.error('  Para resolver, com o backend parado:');
console.error('');
console.error('    pm2 stop deployhub-backend');
console.error(`    cp "${comDados[0].arquivo}" /root/deployhub-backup-$(date +%Y%m%d-%H%M%S).db`);
if (doCanonico) console.error(`    mv "${canonico}" "${canonico}.fora-de-uso"`);
console.error(`    cp "${comDados[0].arquivo}" "${canonico}"`);
console.error('    bash update.sh');
console.error('');
console.error('  Se o banco antigo nunca passou por migrations, o update.sh baselina');
console.error('  sozinho. Confira o resultado antes de religar o backend.');
console.error('');

process.exit(1);
