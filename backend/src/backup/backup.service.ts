import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { assertInside } from '../common/paths';
import { runQuiet } from '../common/run';
import {
  backupFileName,
  buildDumpCommand,
  expiredBackups,
  extractDatabaseUrl,
  parseDatabaseUrl,
  requiredBinary,
} from './database-url';

export interface BackupFile {
  name: string;
  sizeBytes: number;
  modifiedAt: Date;
  kind: 'panel' | 'app';
  appName?: string;
}

export interface BackupResult {
  ok: boolean;
  file?: string;
  error?: string;
  target: string;
}

/**
 * Backup agendado do banco do painel e dos bancos das aplicações.
 *
 * ## Por que o banco do painel precisa disso
 *
 * Todo o estado do DeployHub — apps, projetos, histórico de deploys com os logs,
 * métricas, usuários e as variáveis de ambiente criptografadas — vive num único arquivo
 * SQLite. Perder esse arquivo é perder a memória inteira da operação, e até agora o
 * único backup existente era a cópia que o `update.sh` faz antes de migrar.
 *
 * ## O detalhe que faz o backup do SQLite prestar
 *
 * Copiar o arquivo com `cp` enquanto o banco está aberto pode gerar uma cópia
 * corrompida: a escrita de uma transação pode estar no meio do caminho. O jeito certo é
 * `VACUUM INTO`, que o próprio SQLite executa de forma consistente e ainda devolve um
 * arquivo compactado, sem as páginas livres.
 *
 * ## E o backup dos bancos das aplicações
 *
 * Opcional e best-effort: o painel lê a `DATABASE_URL` do `.env` de cada app e, quando
 * ela aponta para Postgres ou MySQL, roda `pg_dump`/`mysqldump`. A senha **nunca** vai
 * no argv — ver `database-url.ts` para o porquê.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger('BackupService');

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  /** Diretório dos backups. Fica fora de APPS_DIR para não ser varrido pela limpeza de releases. */
  get backupDir(): string {
    return process.env.BACKUP_DIR || '/var/backups/deployhub';
  }

  private get panelDbPath(): string {
    // Mesmo caminho fixado em schema.prisma (`file:./deployhub.db`, relativo ao dir do schema).
    return path.resolve(process.cwd(), 'prisma', 'deployhub.db');
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledBackup(): Promise<void> {
    const { backupEnabled } = await this.settings.getBackup();
    if (!backupEnabled) {
      this.logger.log('Backup automático desligado nas configurações.');
      return;
    }

    await this.runAll();
  }

  /** Roda o backup completo agora. Usado pelo cron e pelo botão do painel. */
  async runAll(): Promise<BackupResult[]> {
    await fs.promises.mkdir(this.backupDir, { recursive: true, mode: 0o700 });

    const resultados: BackupResult[] = [await this.backupPanelDatabase()];

    const { backupApps } = await this.settings.getBackup();
    if (backupApps) {
      resultados.push(...(await this.backupAppDatabases()));
    }

    await this.cleanupExpired();

    const falhas = resultados.filter((r) => !r.ok);
    if (falhas.length > 0) {
      this.logger.warn(`${falhas.length} backup(s) falharam: ${falhas.map((f) => f.target).join(', ')}`);
    }

    return resultados;
  }

  /**
   * Backup do banco do painel com `VACUUM INTO`.
   *
   * Consistente mesmo com o banco em uso, ao contrário de um `cp` do arquivo.
   */
  async backupPanelDatabase(): Promise<BackupResult> {
    const nome = backupFileName('deployhub-painel', 'db');
    const destino = path.join(this.backupDir, nome);

    try {
      // O caminho é montado aqui mesmo e passa por assertInside como segunda camada:
      // o VACUUM INTO sobrescreveria qualquer arquivo que recebesse.
      assertInside(destino, [this.backupDir], 'destino do backup');

      // VACUUM INTO falha se o arquivo já existir — o carimbo com segundos torna a
      // colisão improvável, mas remover antes evita o erro numa execução manual
      // logo após a automática.
      await fs.promises.rm(destino, { force: true });

      await this.prisma.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
      await fs.promises.chmod(destino, 0o600);

      this.logger.log(`Backup do painel criado: ${nome}`);
      return { ok: true, file: nome, target: 'painel' };
    } catch (error: any) {
      return { ok: false, error: error.message, target: 'painel' };
    }
  }

  /** Dump dos bancos Postgres/MySQL declarados no `.env` de cada app. */
  async backupAppDatabases(): Promise<BackupResult[]> {
    const apps = await this.prisma.app.findMany({ select: { id: true, name: true, envVars: true } });
    const resultados: BackupResult[] = [];

    for (const app of apps) {
      const url = extractDatabaseUrl(app.envVars);
      if (!url) continue;

      const parsed = parseDatabaseUrl(url);
      if (!parsed) continue;

      resultados.push(await this.dumpAppDatabase(app.name, parsed));
    }

    return resultados;
  }

  private async dumpAppDatabase(
    appName: string,
    parsed: ReturnType<typeof parseDatabaseUrl> & object,
  ): Promise<BackupResult> {
    const binario = requiredBinary(parsed.engine);

    if (!(await runQuiet('which', [binario]))) {
      return {
        ok: false,
        target: appName,
        error: `${binario} não está instalado neste servidor`,
      };
    }

    const nome = backupFileName(`${appName}-${parsed.engine}`, 'sql');
    const destino = path.join(this.backupDir, nome);
    const { file, args, env } = buildDumpCommand(parsed);

    try {
      await new Promise<void>((resolve, reject) => {
        // A saída do dump vai para o arquivo por stream, então nem o caminho de
        // destino entra no argv da ferramenta externa.
        const saida = fs.createWriteStream(destino, { mode: 0o600 });
        const proc = spawn(file, args, { env: { ...process.env, ...env } });

        let erro = '';
        proc.stdout.pipe(saida);
        proc.stderr.on('data', (chunk) => {
          erro += chunk.toString();
        });

        proc.on('error', reject);
        proc.on('close', (code) => {
          saida.end();
          if (code === 0) resolve();
          // A mensagem do pg_dump pode conter o host e o usuário, mas nunca a senha —
          // ela não passou pelo argv nem pela saída.
          else reject(new Error(erro.trim().split('\n').slice(-3).join(' ') || `exit ${code}`));
        });
      });

      this.logger.log(`Backup do banco de ${appName} criado: ${nome}`);
      return { ok: true, file: nome, target: appName };
    } catch (error: any) {
      // Arquivo parcial não serve como backup e induz a erro numa restauração.
      await fs.promises.rm(destino, { force: true }).catch(() => undefined);
      return { ok: false, target: appName, error: error.message };
    }
  }

  /** Backups existentes, do mais novo para o mais antigo. */
  async list(): Promise<BackupFile[]> {
    try {
      const nomes = await fs.promises.readdir(this.backupDir);
      const arquivos: BackupFile[] = [];

      for (const nome of nomes) {
        if (!nome.endsWith('.db') && !nome.endsWith('.sql')) continue;

        const stat = await fs.promises.stat(path.join(this.backupDir, nome)).catch(() => null);
        if (!stat?.isFile()) continue;

        const ehPainel = nome.startsWith('deployhub-painel_');
        arquivos.push({
          name: nome,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime,
          kind: ehPainel ? 'panel' : 'app',
          appName: ehPainel ? undefined : nome.split('_')[0],
        });
      }

      return arquivos.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    } catch {
      return [];
    }
  }

  /** Remove os backups que passaram da retenção configurada. */
  async cleanupExpired(): Promise<number> {
    const { backupRetentionDays } = await this.settings.getBackup();
    const arquivos = await this.list();
    const vencidos = expiredBackups(arquivos, backupRetentionDays);

    let removidos = 0;
    for (const nome of vencidos) {
      try {
        const caminho = assertInside(path.join(this.backupDir, nome), [this.backupDir], 'arquivo de backup');
        await fs.promises.rm(caminho, { force: true });
        removidos++;
      } catch (error: any) {
        this.logger.warn(`Não foi possível remover ${nome}: ${error.message}`);
      }
    }

    if (removidos > 0) {
      this.logger.log(`${removidos} backup(s) com mais de ${backupRetentionDays} dias removidos`);
    }
    return removidos;
  }

  /** Caminho absoluto de um backup, validado. Usado pelo download. */
  async resolveBackupPath(name: string): Promise<string> {
    // O nome vem da URL: sem o assertInside, um `../../etc/passwd` sairia do diretório.
    const caminho = assertInside(path.join(this.backupDir, name), [this.backupDir], 'arquivo de backup');
    await fs.promises.access(caminho, fs.constants.R_OK);
    return caminho;
  }

  async remove(name: string): Promise<void> {
    const caminho = await this.resolveBackupPath(name);
    await fs.promises.rm(caminho, { force: true });
  }
}
