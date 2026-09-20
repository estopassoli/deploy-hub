import { useCallback, useEffect, useState } from 'react';
import { Database, Download, HardDrive, Loader2, Play, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
import { Callout } from '@/components/ds/callout';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { toast } from 'sonner';

/**
 * Backup agendado do banco do painel e, opcionalmente, dos bancos das aplicações.
 *
 * Todo o estado do DeployHub — apps, projetos, histórico de deploys com os logs,
 * métricas, usuários e as variáveis de ambiente criptografadas — vive num único arquivo
 * SQLite. Até agora o único backup existente era a cópia que o `update.sh` faz antes de
 * migrar, ou seja, só havia backup em dia de atualização.
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function BackupSettings() {
  const [files, setFiles] = useState<any[]>([]);
  const [config, setConfig] = useState({ backupEnabled: true, backupRetentionDays: 14, backupApps: false });
  const [directory, setDirectory] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  /**
   * Falhas do último backup, uma por alvo.
   *
   * Ficavam concatenadas num único toast: com 15 apps sem Postgres acessível, a
   * mensagem virava uma parede de texto que cobria metade da tela e sumia sozinha.
   * Falha de backup é condição persistente — pertence a um Callout, não a um toast.
   */
  const [falhas, setFalhas] = useState<Array<{ target: string; error?: string }>>([]);

  const load = useCallback(async () => {
    try {
      const data = await api.getBackups();
      setFiles(data.files);
      setConfig(data.config);
      setDirectory(data.directory);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const salvar = async () => {
    setSaving(true);
    try {
      setConfig(await api.updateBackupSettings(config));
      toast.success('Configurações de backup salvas');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const rodarAgora = async () => {
    setRunning(true);
    const aviso = toast.loading('Gerando backup...');
    try {
      const { results } = await api.runBackupNow();
      const semSucesso = results.filter((r) => !r.ok);
      setFalhas(semSucesso);

      if (semSucesso.length === 0) {
        toast.success(`${results.length} backup(s) gerado(s)`, { id: aviso });
      } else {
        // O toast diz o placar; o detalhe fica na tela, onde dá para ler.
        toast.warning(`${results.length - semSucesso.length} de ${results.length} backups OK`, {
          id: aviso,
        });
      }
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao gerar backup', { id: aviso });
    } finally {
      setRunning(false);
    }
  };

  const baixar = async (name: string) => {
    setDownloading(name);
    try {
      await api.downloadBackup(name);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao baixar');
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-foreground">Backup automático</p>
          <p className="text-sm text-muted-foreground">
            Todo dia às 2h, o banco do painel é copiado com <span className="font-mono">VACUUM INTO</span> — que
            produz um arquivo consistente mesmo com o banco em uso, ao contrário de um <span className="font-mono">cp</span>.
          </p>
        </div>
        <Switch
          checked={config.backupEnabled}
          onCheckedChange={(checked) => setConfig({ ...config, backupEnabled: checked })}
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-foreground">Incluir bancos das aplicações</p>
          <p className="text-sm text-muted-foreground">
            Lê a <span className="font-mono">DATABASE_URL</span> do .env de cada app e roda
            <span className="font-mono"> pg_dump</span>/<span className="font-mono">mysqldump</span> quando aponta
            para Postgres ou MySQL. Exige a ferramenta instalada no servidor.
          </p>
        </div>
        <Switch
          checked={config.backupApps}
          onCheckedChange={(checked) => setConfig({ ...config, backupApps: checked })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="backupRetention">Manter backups por (dias)</Label>
        <Input
          id="backupRetention"
          type="number"
          min={1}
          max={365}
          value={config.backupRetentionDays}
          onChange={(e) => setConfig({ ...config, backupRetentionDays: parseInt(e.target.value, 10) || 0 })}
          className="w-32 font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Arquivos em <span className="font-mono">{directory}</span>
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={running} onClick={rodarAgora}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Fazer backup agora
        </Button>
        <Button variant="primary" disabled={saving} onClick={salvar}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar backup
        </Button>
      </div>

      {falhas.length > 0 && (
        <Callout
          tone="amber"
          title={`${falhas.length} ${falhas.length === 1 ? 'backup falhou' : 'backups falharam'}`}
          action={
            <Button variant="ghost" size="xs" onClick={() => setFalhas([])}>
              Dispensar
            </Button>
          }
        >
          <ul className="m-0 flex max-h-40 list-none flex-col gap-1 overflow-auto p-0 pt-1">
            {falhas.map((f) => (
              <li key={f.target} className="flex min-w-0 flex-col">
                <span className="font-mono tabular-nums text-2xs text-text-1">{f.target}</span>
                <span className="truncate font-mono tabular-nums text-2xs text-text-3" title={f.error}>
                  {f.error}
                </span>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <Separator />

      <div className="space-y-2">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <HardDrive className="h-4 w-4 text-primary" />
          Backups disponíveis ({files.length})
        </p>

        {files.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum backup ainda. Use "Fazer backup agora" ou espere o ciclo das 2h.
          </p>
        ) : (
          <div className="space-y-1.5">
            {files.map((file) => (
              <div key={file.name} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
                <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {formatDateTime(file.modifiedAt)}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={downloading === file.name}
                  onClick={() => baixar(file.name)}
                  title="Baixar"
                >
                  {downloading === file.name ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                <ConfirmDeleteDialog
                  name={file.name}
                  title="Excluir este backup?"
                  description={<p>O arquivo é removido do servidor. Se não houver outra cópia, não tem volta.</p>}
                  confirmLabel="Excluir backup"
                  onConfirm={async () => {
                    await api.deleteBackup(file.name);
                    toast.success('Backup removido');
                    await load();
                  }}
                  trigger={
                    <Button size="icon-xs" variant="ghost" className="text-destructive hover:text-destructive" title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
