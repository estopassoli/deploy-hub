import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  Square,
  Trash2,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnvEditor } from '@/components/apps/EnvEditor';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
import { DeployLogSheet } from '@/components/apps/DeployLogSheet';
import { UptimePanel } from '@/components/apps/UptimePanel';
import { AppMetricsChart } from '@/components/dashboard/AppMetricsChart';
import { DetailHeaderSkeleton, LogLinesSkeleton, VersionListSkeleton } from '@/components/Skeletons';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime, formatElapsed, stripAnsi } from '@/lib/format';
import { toast } from 'sonner';

/**
 * Página de detalhe de um app.
 *
 * Antes, tudo o que se podia fazer com um app cabia num card do Dashboard e num modal
 * de configuração: para ver as releases era preciso ir a `/versions` e reselecionar o
 * app; para ver os logs dele, ir a `/logs` e filtrar; as métricas ficavam num segundo
 * modal. Esta página junta as cinco coisas com o contexto do app em volta.
 *
 * O `AppConfigModal` continua existindo para quem chega pelo card, mas o card agora
 * também leva para cá.
 */

const STATUS_LABEL: Record<string, string> = {
  running: 'Rodando',
  stopped: 'Parado',
  error: 'Erro',
  deploying: 'Deployando',
};

export default function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [deploySheetOpen, setDeploySheetOpen] = useState(false);

  // Configurações editáveis
  const [envVars, setEnvVars] = useState('');
  const [config, setConfig] = useState({
    domain: '',
    branch: '',
    installCommand: '',
    buildCommand: '',
    migrateCommand: '',
    startCommand: '',
    runtime: 'auto',
    containerPort: '',
    dockerContext: '',
    healthPath: '',
    maxMemoryMb: '',
    cpuLimit: '',
  });
  const [savedEnv, setSavedEnv] = useState('');

  // Abas carregadas sob demanda
  const [versions, setVersions] = useState<any[] | null>(null);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);

  const load = useCallback(
    async (withForm = false) => {
      if (!id) return;
      try {
        const data = await api.getApp(id);
        setApp(data);
        if (withForm) {
          setEnvVars(data.envVars || '');
          setSavedEnv(data.envVars || '');
          setConfig({
            domain: data.domain || '',
            branch: data.branch || '',
            installCommand: data.installCommand || '',
            buildCommand: data.buildCommand || '',
            migrateCommand: data.migrateCommand || '',
            startCommand: data.startCommand || '',
            runtime: data.runtime || 'auto',
            containerPort: data.containerPort != null ? String(data.containerPort) : '',
            dockerContext: data.dockerContext || '',
            healthPath: data.healthPath || '',
            maxMemoryMb: data.maxMemoryMb != null ? String(data.maxMemoryMb) : '',
            cpuLimit: data.cpuLimit != null ? String(data.cpuLimit) : '',
          });
        }
      } catch (error: any) {
        toast.error(error.message || 'Erro ao carregar o app');
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Atualiza status/uptime enquanto a página está aberta.
  useEffect(() => {
    const timer = setInterval(() => load(false), 5000);
    return () => clearInterval(timer);
  }, [load]);

  /** Chave do stream de deploy: projeto quando for service de monorepo. */
  const deployKey = useMemo(() => app?.project?.name || app?.name || '', [app]);

  const run = async (label: string, action: () => Promise<unknown>, successMessage: string) => {
    setBusy(label);
    try {
      await action();
      toast.success(successMessage);
      await load(false);
    } catch (error: any) {
      toast.error(error.message || `Erro ao ${label}`);
    } finally {
      setBusy(null);
    }
  };

  const saveConfig = async (extra?: Record<string, unknown>) => {
    if (!id) return;
    await api.updateApp(id, { ...config, envVars, ...(extra ?? {}) });
    setSavedEnv(envVars);
  };

  const handleSave = () =>
    run('salvar', async () => saveConfig(), 'Configurações salvas — aplicam no próximo deploy');

  const handleSaveAndRestart = () =>
    run(
      'aplicar',
      async () => {
        await saveConfig();
        const result = await api.applyEnv(id!);
        if (result.diff.buildRequired.length > 0) {
          toast.warning(result.message, { duration: 10000 });
        }
      },
      'Variáveis aplicadas e app reiniciado',
    );

  const handleSaveAndRedeploy = async () => {
    setBusy('redeploy');
    try {
      await saveConfig();
      setDeploySheetOpen(true);
      await api.redeploy(id!);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao redeployar');
    } finally {
      setBusy(null);
    }
  };

  const loadVersions = useCallback(async () => {
    if (!id) return;
    try {
      setVersions(await api.getAppVersions(id));
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar releases');
      setVersions([]);
    }
  }, [id]);

  const loadLogs = useCallback(async () => {
    if (!id) return;
    try {
      setLogs(await api.getAppLogs(id, 200));
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar logs');
      setLogs([]);
    }
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className="mx-auto max-w-5xl">
          <DetailHeaderSkeleton />
        </div>
      </Layout>
    );
  }

  if (!app) {
    return (
      <Layout>
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <h3 className="text-lg font-medium">App não encontrado</h3>
          <Button asChild variant="gradient" className="mt-4">
            <Link to="/">Voltar ao Dashboard</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  // Vem da API: o backend conhece o registro de presets, o frontend não precisa.
  const isStatic = Boolean(app.isStatic);
  const statusColor =
    app.status === 'running' ? 'bg-success' : app.hasProblem ? 'bg-destructive' : 'bg-muted-foreground';

  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', statusColor)} />
              <h1 className="truncate text-2xl font-bold text-foreground md:text-3xl">{app.name}</h1>
              {app.hasProblem && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  Fora do ar
                </span>
              )}
            </div>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {app.repository} · {app.branch} · {app.type} · :{app.port}
              {app.activeRuntime ? ` · ${app.activeRuntime}` : ''}
              {app.project ? ` · projeto ${app.project.name}` : ''}
            </p>
          </div>

          {app.domain && (
            <Button asChild variant="outline" size="sm">
              <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Abrir
              </a>
            </Button>
          )}
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="env">Variáveis</TabsTrigger>
            <TabsTrigger value="deploys" onClick={() => versions === null && loadVersions()}>
              Deploys
            </TabsTrigger>
            <TabsTrigger value="logs" onClick={() => logs === null && loadLogs()}>
              Logs
            </TabsTrigger>
            <TabsTrigger value="config">Configurações</TabsTrigger>
            <TabsTrigger value="danger" className="text-destructive data-[state=active]:text-destructive">
              Zona de perigo
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Visão geral ---------------- */}
          <TabsContent value="overview" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoCard label="Status" value={STATUS_LABEL[app.status] ?? app.status} icon={<Activity className="h-4 w-4" />} />
              <InfoCard label="Uptime" value={app.uptime || '-'} icon={<Clock className="h-4 w-4" />} />
              <InfoCard label="CPU" value={`${app.cpu ?? 0}%`} />
              <InfoCard label="Memória" value={`${app.memory ?? 0} MB`} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard label="Domínio" value={app.domain || 'sem domínio'} icon={<Globe className="h-4 w-4" />} />
              <InfoCard
                label="Último deploy"
                value={app.deploys?.[0] ? formatDateTime(app.deploys[0].createdAt) : 'nenhum ainda'}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {isStatic ? null : app.status === 'running' ? (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => run('parar', () => api.stopApp(app.id), `${app.name} parado`)}
                >
                  {busy === 'parar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  Parar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => run('iniciar', () => api.startApp(app.id), `${app.name} iniciado`)}
                >
                  {busy === 'iniciar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Iniciar
                </Button>
              )}

              {!isStatic && (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => run('reiniciar', () => api.restartApp(app.id), `${app.name} reiniciado`)}
                >
                  {busy === 'reiniciar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Reiniciar
                </Button>
              )}

              <Button variant="gradient" disabled={busy !== null} onClick={handleSaveAndRedeploy}>
                {busy === 'redeploy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Redeploy
              </Button>

              <Button variant="outline" onClick={() => setMetricsOpen(true)}>
                <Activity className="h-4 w-4" />
                Histórico de CPU/RAM
              </Button>
            </div>

            {/* Disponibilidade externa e validade do certificado. */}
            <UptimePanel appId={app.id} domain={app.domain} />

            <AppMetricsChart appId={app.id} appName={app.name} open={metricsOpen} onOpenChange={setMetricsOpen} />
          </TabsContent>

          {/* ---------------- Variáveis ---------------- */}
          <TabsContent value="env" className="space-y-4 pt-4">
            <div className="rounded-xl border border-border bg-card p-4 md:p-6">
              <EnvEditor
                value={envVars}
                onChange={setEnvVars}
                baseline={savedEnv}
                label="Variáveis de ambiente"
                description={`Viram o arquivo .env de ${app.appDir ? `${app.appDir}/` : 'raiz da release'}.`}
              />
            </div>
            <SaveBar
              busy={busy}
              onSave={handleSave}
              onSaveAndRestart={isStatic ? undefined : handleSaveAndRestart}
              onSaveAndRedeploy={handleSaveAndRedeploy}
            />
          </TabsContent>

          {/* ---------------- Deploys ---------------- */}
          <TabsContent value="deploys" className="space-y-3 pt-4">
            {versions === null ? (
              <VersionListSkeleton />
            ) : versions.length === 0 ? (
              <EmptyState message="Nenhum deploy registrado ainda." />
            ) : (
              versions.map((version) => (
                <div
                  key={version.id}
                  className={cn(
                    'rounded-xl border p-4',
                    version.isCurrent ? 'border-primary/30 bg-primary/5' : 'border-border bg-card',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{version.version}</span>
                        {version.isCurrent && (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">Ativa</span>
                        )}
                        <StatusBadge status={version.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {version.commitMessage || 'Sem mensagem de commit'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(version.createdAt)} · duração{' '}
                        {formatElapsed(version.startedAt ?? version.createdAt, version.finishedAt)}
                        {version.commitHash ? ` · ${version.commitHash}` : ''}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            const data = await api.getDeployLogs(version.id);
                            toast.message(`Logs de ${version.version}`, {
                              description: (data.logs || '').split('\n').slice(-12).join('\n'),
                              duration: 15000,
                            });
                          } catch (error: any) {
                            toast.error(error.message || 'Erro ao carregar logs');
                          }
                        }}
                      >
                        <FileText className="h-4 w-4" />
                        Logs
                      </Button>
                      {!version.isCurrent && version.status === 'success' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            run(
                              'rollback',
                              async () => {
                                await api.rollbackApp(app.id, version.id);
                                await loadVersions();
                              },
                              `Voltou para ${version.version}`,
                            )
                          }
                        >
                          <RotateCcw className="h-4 w-4" />
                          Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* ---------------- Logs ---------------- */}
          <TabsContent value="logs" className="pt-4">
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
                <span className="font-mono text-xs text-muted-foreground">logs --app {app.name}</span>
                <Button size="sm" variant="ghost" onClick={() => { setLogs(null); loadLogs(); }}>
                  <RefreshCw className="h-4 w-4" />
                  Atualizar
                </Button>
              </div>
              {logs === null ? (
                <LogLinesSkeleton />
              ) : logs.length === 0 ? (
                <EmptyState message="Nenhuma linha de log para este app." />
              ) : (
                <div className="max-h-[500px] overflow-auto p-4 font-mono text-xs terminal-scroll">
                  {logs.map((log, index) => (
                    <div key={log.id ?? index} className="break-all py-0.5 text-foreground/90">
                      {stripAnsi(log.message)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ---------------- Configurações ---------------- */}
          <TabsContent value="config" className="space-y-4 pt-4">
            <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:p-6 sm:grid-cols-2">
              <Field label="Domínio" value={config.domain} onChange={(v) => setConfig({ ...config, domain: v })} placeholder="api.exemplo.com" />
              <Field label="Branch" value={config.branch} onChange={(v) => setConfig({ ...config, branch: v })} placeholder="main" />
              <Field label="Install command" value={config.installCommand} onChange={(v) => setConfig({ ...config, installCommand: v })} placeholder="pnpm install" />
              <Field label="Build command" value={config.buildCommand} onChange={(v) => setConfig({ ...config, buildCommand: v })} placeholder="pnpm build" />
              <Field label="Migrate command" value={config.migrateCommand} onChange={(v) => setConfig({ ...config, migrateCommand: v })} placeholder="pnpm prisma migrate deploy" />
              <Field label="Start command" value={config.startCommand} onChange={(v) => setConfig({ ...config, startCommand: v })} placeholder="node dist/main.js" />

              <div className="space-y-1">
                <Label className="text-xs">Runtime</Label>
                <select
                  value={config.runtime}
                  onChange={(e) => setConfig({ ...config, runtime: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="auto">auto — Docker se houver Dockerfile/compose</option>
                  <option value="pm2">pm2 — sempre processo Node</option>
                  <option value="docker">docker — sempre container</option>
                </select>
              </div>

              <Field label="Porta interna do container" value={config.containerPort} onChange={(v) => setConfig({ ...config, containerPort: v })} placeholder={`EXPOSE do Dockerfile, senão ${app.port}`} />
              <Field label="Docker context" value={config.dockerContext} onChange={(v) => setConfig({ ...config, dockerContext: v })} placeholder="raiz do repositório" />
              <Field
                label="Health check"
                value={config.healthPath}
                onChange={(v) => setConfig({ ...config, healthPath: v })}
                placeholder="/"
                hint="Checado em 127.0.0.1 após o start. Sem resposta, o deploy volta para a release anterior."
              />
            </div>

            {/* Limites de recurso */}
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-6">
              <h3 className="font-semibold text-foreground">Limites de recurso</h3>
              <p className="text-sm text-muted-foreground">
                Num servidor com vários apps, um vazamento de memória em um consome a RAM da
                máquina inteira e o OOM killer do Linux escolhe a vítima — normalmente o processo
                maior, não o culpado. Um teto por app transforma "o servidor caiu" em "um app
                reiniciou". Vazio = sem limite.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Memória máxima (MB)"
                  value={config.maxMemoryMb}
                  onChange={(v) => setConfig({ ...config, maxMemoryMb: v })}
                  placeholder="512"
                  hint={
                    app.activeRuntime === 'docker'
                      ? 'No Docker, ultrapassar faz o kernel MATAR o container (ele volta pelo restart).'
                      : 'No PM2, ultrapassar REINICIA o processo — interrupção curta, o app volta sozinho.'
                  }
                />
                <Field
                  label="Limite de CPU"
                  value={config.cpuLimit}
                  onChange={(v) => setConfig({ ...config, cpuLimit: v })}
                  placeholder="0.5"
                  hint={
                    app.activeRuntime === 'docker'
                      ? '0.5 = meio núcleo. Só vale em Docker.'
                      : 'Só tem efeito em runtime Docker — o PM2 não limita CPU.'
                  }
                />
              </div>
            </div>

            <SaveBar
              busy={busy}
              onSave={handleSave}
              onSaveAndRestart={isStatic ? undefined : handleSaveAndRestart}
              onSaveAndRedeploy={handleSaveAndRedeploy}
            />

            <div className="rounded-xl border border-border bg-card p-4 md:p-6">
              <h3 className="mb-2 font-semibold">Webhook</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Push na branch <span className="font-mono">{app.branch}</span> dispara um deploy.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/github">
                  <ScrollText className="h-4 w-4" />
                  Ver secret e workflow
                </Link>
              </Button>
            </div>
          </TabsContent>

          {/* ---------------- Zona de perigo ---------------- */}
          <TabsContent value="danger" className="pt-4">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 md:p-6">
              <h3 className="mb-2 font-semibold text-destructive">Excluir {app.name}</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Para o processo, remove containers e imagens, apaga o vhost do Nginx,
                <span className="font-mono"> /var/www/{app.name}</span> e
                <span className="font-mono"> ~/apps/{app.name}</span> inteiro — com todas as releases
                e o histórico de deploys. Não tem volta.
              </p>
              <ConfirmDeleteDialog
                name={app.name}
                description={
                  <>
                    <p>Esta ação é irreversível e afeta um app em produção.</p>
                    <p>
                      Todas as releases em <span className="font-mono">~/apps/{app.name}/releases</span> serão
                      apagadas junto.
                    </p>
                  </>
                }
                confirmLabel={`Excluir ${app.name}`}
                onConfirm={async () => {
                  await api.deleteApp(app.id);
                  toast.success(`${app.name} excluído`);
                  navigate('/');
                }}
                trigger={
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4" />
                    Excluir app
                  </Button>
                }
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <DeployLogSheet
        open={deploySheetOpen}
        onOpenChange={setDeploySheetOpen}
        deployKey={deployKey}
        title={`Deploy de ${app.name}`}
        onFinished={() => load(false)}
      />
    </Layout>
  );
}

// --- peças pequenas ------------------------------------------------------------

function InfoCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate font-medium text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="font-mono text-sm" />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; className: string }> = {
    success: { label: 'Sucesso', className: 'bg-success/20 text-success' },
    failed: { label: 'Falhou', className: 'bg-destructive/20 text-destructive' },
    building: { label: 'Em andamento', className: 'bg-warning/20 text-warning' },
    cancelled: { label: 'Cancelado', className: 'bg-muted text-muted-foreground' },
  };
  const info = map[status ?? ''] ?? { label: status ?? '-', className: 'bg-muted text-muted-foreground' };
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', info.className)}>{info.label}</span>;
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-4 py-12 text-center text-sm text-muted-foreground">{message}</p>;
}

/** Os três caminhos de salvar, com o mesmo significado em todas as telas. */
function SaveBar({
  busy,
  onSave,
  onSaveAndRestart,
  onSaveAndRedeploy,
}: {
  busy: string | null;
  onSave: () => void;
  onSaveAndRestart?: () => void;
  onSaveAndRedeploy: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" disabled={busy !== null} onClick={onSave} title="Grava no banco; aplica no próximo deploy">
        {busy === 'salvar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar
      </Button>
      {onSaveAndRestart && (
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={onSaveAndRestart}
          title="Reescreve o .env da release atual e reinicia — sem refazer o build"
        >
          {busy === 'aplicar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Salvar e reiniciar
        </Button>
      )}
      <Button
        variant="gradient"
        disabled={busy !== null}
        onClick={onSaveAndRedeploy}
        title="Clone, install e build completos — necessário para NEXT_PUBLIC_/VITE_"
      >
        {busy === 'redeploy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        Salvar e fazer redeploy
      </Button>
    </div>
  );
}
