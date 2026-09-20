import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  backupFileName,
  buildDumpCommand,
  expiredBackups,
  extractDatabaseUrl,
  parseDatabaseUrl,
  requiredBinary,
} from './database-url.ts';

test('parseDatabaseUrl entende Postgres com e sem porta', () => {
  assert.deepEqual(parseDatabaseUrl('postgres://usuario:senha@db.exemplo.com:5433/meubanco'), {
    engine: 'postgres',
    host: 'db.exemplo.com',
    port: 5433,
    user: 'usuario',
    password: 'senha',
    database: 'meubanco',
  });

  assert.equal(parseDatabaseUrl('postgresql://u:p@host/db')?.port, 5432, 'porta padrão');
});

test('parseDatabaseUrl entende MySQL e MariaDB', () => {
  assert.equal(parseDatabaseUrl('mysql://u:p@host/db')?.engine, 'mysql');
  assert.equal(parseDatabaseUrl('mariadb://u:p@host/db')?.engine, 'mysql');
  assert.equal(parseDatabaseUrl('mysql://u:p@host/db')?.port, 3306);
});

test('parseDatabaseUrl decodifica caractere especial na senha', () => {
  // Senha com @ ou / precisa vir percent-encoded na URL; sem decodificar, o dump
  // autenticaria com a senha errada.
  const parsed = parseDatabaseUrl('postgres://user:p%40ss%2Fword@host/db');
  assert.equal(parsed?.password, 'p@ss/word');
});

test('parseDatabaseUrl recusa o que não é Postgres nem MySQL', () => {
  // Um dump errado é pior que dump nenhum.
  for (const url of [
    'file:./deployhub.db',
    'redis://localhost:6379',
    'mongodb://host/db',
    'postgres://host',
    'não é url',
    '',
    null,
  ]) {
    assert.equal(parseDatabaseUrl(url as any), null, String(url));
  }
});

test('parseDatabaseUrl recusa URL sem nome de banco', () => {
  assert.equal(parseDatabaseUrl('postgres://u:p@host/'), null);
});

// --- a parte que mais importa: senha fora do argv -----------------------------

test('a senha NUNCA aparece nos argumentos do pg_dump', () => {
  // `ps aux` mostra o argv de todo processo para qualquer usuário da máquina — e este
  // painel dá shell. Senha no argv é senha vazada.
  const parsed = parseDatabaseUrl('postgres://usuario:SENHA_SECRETA@host/db')!;
  const cmd = buildDumpCommand(parsed);

  assert.equal(cmd.file, 'pg_dump');
  assert.equal(cmd.args.join(' ').includes('SENHA_SECRETA'), false);
  assert.equal(cmd.env.PGPASSWORD, 'SENHA_SECRETA', 'vai por variável de ambiente');
});

test('a senha NUNCA aparece nos argumentos do mysqldump', () => {
  const parsed = parseDatabaseUrl('mysql://usuario:SENHA_SECRETA@host/db')!;
  const cmd = buildDumpCommand(parsed);

  assert.equal(cmd.file, 'mysqldump');
  assert.equal(cmd.args.join(' ').includes('SENHA_SECRETA'), false);
  assert.equal(cmd.env.MYSQL_PWD, 'SENHA_SECRETA');
});

test('pg_dump recebe --no-password para não travar num cron', () => {
  // Sem isto, um erro de autenticação abre prompt e o processo fica pendurado.
  const cmd = buildDumpCommand(parseDatabaseUrl('postgres://u:p@host/db')!);
  assert.ok(cmd.args.includes('--no-password'));
});

test('mysqldump usa --single-transaction para não travar a aplicação', () => {
  const cmd = buildDumpCommand(parseDatabaseUrl('mysql://u:p@host/db')!);
  assert.ok(cmd.args.includes('--single-transaction'));
  assert.ok(cmd.args.includes('--skip-lock-tables'));
});

test('requiredBinary aponta a ferramenta certa', () => {
  assert.equal(requiredBinary('postgres'), 'pg_dump');
  assert.equal(requiredBinary('mysql'), 'mysqldump');
});

// --- extração do .env ---------------------------------------------------------

test('extractDatabaseUrl acha a variável e tira as aspas', () => {
  assert.equal(extractDatabaseUrl('A=1\nDATABASE_URL="postgres://u:p@h/db"\nB=2'), 'postgres://u:p@h/db');
  assert.equal(extractDatabaseUrl('POSTGRES_URL=postgres://u:p@h/db'), 'postgres://u:p@h/db');
  assert.equal(extractDatabaseUrl('MYSQL_URL=mysql://u:p@h/db'), 'mysql://u:p@h/db');
});

test('extractDatabaseUrl ignora comentário e devolve null sem a variável', () => {
  assert.equal(extractDatabaseUrl('# DATABASE_URL=postgres://u:p@h/db'), null);
  assert.equal(extractDatabaseUrl('OUTRA=coisa'), null);
  assert.equal(extractDatabaseUrl(null), null);
});

// --- nomes e retenção ---------------------------------------------------------

test('backupFileName ordena alfabeticamente por data', () => {
  const antigo = backupFileName('deployhub', 'db', new Date('2026-01-05T10:00:00Z'));
  const novo = backupFileName('deployhub', 'db', new Date('2026-09-20T10:00:00Z'));
  assert.ok(antigo < novo, 'a ordem alfabética precisa bater com a cronológica');
  assert.match(novo, /^deployhub_2026-09-20_10-00-00\.db$/);
});

test('expiredBackups seleciona só o que passou da retenção', () => {
  const agora = new Date('2026-09-20T12:00:00Z');
  const dias = (n: number) => new Date(agora.getTime() - n * 86_400_000);

  const vencidos = expiredBackups(
    [
      { name: 'novo.db', modifiedAt: dias(1) },
      { name: 'limite.db', modifiedAt: dias(6) },
      { name: 'velho.db', modifiedAt: dias(10) },
      { name: 'antiquissimo.db', modifiedAt: dias(90) },
    ],
    7,
    agora,
  );

  assert.deepEqual(vencidos, ['velho.db', 'antiquissimo.db']);
});
