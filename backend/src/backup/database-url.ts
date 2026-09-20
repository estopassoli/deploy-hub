/**
 * Leitura de `DATABASE_URL` e construção dos comandos de dump.
 *
 * ## O cuidado central: a senha nunca vai para a linha de comando
 *
 * A forma "óbvia" de chamar o pg_dump é `pg_dump "postgres://user:senha@host/db"`. Isso
 * coloca a senha no **argv do processo**, que qualquer usuário da máquina lê com um
 * `ps aux` — e este painel oferece um shell a quem estiver logado. Um backup que vaza a
 * senha do banco de produção enquanto roda é pior que não ter backup automático.
 *
 * Por isso a credencial viaja por variável de ambiente (`PGPASSWORD`, `MYSQL_PWD`), que
 * não aparece no `ps` de outros usuários, e os demais parâmetros vão como argumentos
 * separados — sem shell, sem interpolação.
 *
 * Módulo puro, testável pelo `node --test`.
 */

export type DatabaseEngine = 'postgres' | 'mysql';

export interface ParsedDatabaseUrl {
  engine: DatabaseEngine;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const DEFAULT_PORTS: Record<DatabaseEngine, number> = {
  postgres: 5432,
  mysql: 3306,
};

/**
 * Interpreta uma `DATABASE_URL` de Postgres ou MySQL.
 *
 * Devolve `null` para qualquer coisa que não seja um dos dois — SQLite (`file:`),
 * Redis, Mongo — em vez de tentar adivinhar. Um dump errado é pior que dump nenhum.
 */
export function parseDatabaseUrl(raw: string | null | undefined): ParsedDatabaseUrl | null {
  if (!raw || typeof raw !== 'string') return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const protocolo = url.protocol.replace(':', '').toLowerCase();

  let engine: DatabaseEngine;
  if (protocolo === 'postgres' || protocolo === 'postgresql') engine = 'postgres';
  else if (protocolo === 'mysql' || protocolo === 'mariadb') engine = 'mysql';
  else return null;

  const database = url.pathname.replace(/^\//, '').split('?')[0];
  if (!database) return null;
  if (!url.hostname) return null;

  return {
    engine,
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : DEFAULT_PORTS[engine],
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent(database),
  };
}

export interface DumpCommand {
  file: string;
  args: string[];
  /** Variáveis extras, onde a senha viaja. */
  env: Record<string, string>;
}

/**
 * Monta o comando de dump.
 *
 * A saída vai para stdout e é redirecionada pelo chamador para o arquivo — assim nem o
 * caminho de destino precisa entrar no argv de uma ferramenta externa.
 */
export function buildDumpCommand(parsed: ParsedDatabaseUrl): DumpCommand {
  if (parsed.engine === 'postgres') {
    return {
      file: 'pg_dump',
      args: [
        '--host', parsed.host,
        '--port', String(parsed.port),
        '--username', parsed.user,
        // Sem isto o pg_dump abre um prompt e o processo trava para sempre num cron.
        '--no-password',
        '--format', 'plain',
        '--no-owner',
        '--no-privileges',
        parsed.database,
      ],
      env: { PGPASSWORD: parsed.password },
    };
  }

  return {
    file: 'mysqldump',
    args: [
      `--host=${parsed.host}`,
      `--port=${parsed.port}`,
      `--user=${parsed.user}`,
      '--single-transaction',
      '--quick',
      '--skip-lock-tables',
      parsed.database,
    ],
    env: { MYSQL_PWD: parsed.password },
  };
}

/** Binário necessário para dumpar este banco — usado para avisar quando falta. */
export function requiredBinary(engine: DatabaseEngine): string {
  return engine === 'postgres' ? 'pg_dump' : 'mysqldump';
}

/**
 * Extrai a `DATABASE_URL` de um texto de `.env`.
 *
 * Aceita também `POSTGRES_URL` e `MYSQL_URL`, que aparecem com frequência.
 */
export function extractDatabaseUrl(envVars: string | null | undefined): string | null {
  if (!envVars) return null;

  const candidatos = ['DATABASE_URL', 'POSTGRES_URL', 'MYSQL_URL', 'DB_URL'];

  for (const linha of envVars.split('\n')) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;

    const eq = limpa.indexOf('=');
    if (eq <= 0) continue;

    const chave = limpa.slice(0, eq).trim();
    if (!candidatos.includes(chave)) continue;

    let valor = limpa.slice(eq + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    return valor || null;
  }

  return null;
}

/**
 * Nome do arquivo de backup.
 *
 * Mesmo carimbo usado nos diretórios de release (`2026-09-20_10-00-00`), inclusive o
 * `T` virando `_`: a ordem alfabética precisa bater com a cronológica, porque é por ela
 * que a limpeza por retenção e a listagem se orientam.
 */
export function backupFileName(prefix: string, extension: string, now: Date = new Date()): string {
  const carimbo = now.toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  return `${prefix}_${carimbo}.${extension}`;
}

/** Backups que passaram da retenção, dado o nome dos arquivos. */
export function expiredBackups(
  files: Array<{ name: string; modifiedAt: Date }>,
  retentionDays: number,
  now: Date = new Date(),
): string[] {
  const corte = now.getTime() - retentionDays * 86_400_000;
  return files.filter((file) => file.modifiedAt.getTime() < corte).map((file) => file.name);
}
