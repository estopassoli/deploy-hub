import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Server,
  Rocket,
  Activity,
  AlertCircle,
  Plus,
  Loader2,
  Trash2,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { AppCard } from '@/components/dashboard/AppCard';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { UsageChart } from '@/components/dashboard/UsageChart';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AppFilters } from '@/components/dashboard/AppFilters';
import { AppFiltersState, DEFAULT_APP_FILTERS, filterApps } from '@/lib/app-filters';
import { AppCompactRow } from '@/components/dashboard/AppCompactRow';
import { AppCardSkeleton, StatsCardSkeleton } from '@/components/Skeletons';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { toast } from 'sonner';

const REFRESH_INTERVAL = 5000; // 5 seconds for real-time metrics

export default function Dashboard() {
  const [apps, setApps] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [sslLoading, setSslLoading] = useState<string | null>(null);
  // Preferências de visualização persistem: quem trabalha em lista compacta não quer
  // voltar para cards a cada reload.
  const [filters, setFilters] = useState<AppFiltersState>(() => {
    try {
      const raw = localStorage.getItem('deployhub:app-filters');
      return raw ? { ...DEFAULT_APP_FILTERS, ...JSON.parse(raw), search: '' } : DEFAULT_APP_FILTERS;
    } catch {
      return DEFAULT_APP_FILTERS;
    }
  });

  const updateFilters = (next: AppFiltersState) => {
    setFilters(next);
    try {
      localStorage.setItem(
        'deployhub:app-filters',
        JSON.stringify({ status: next.status, type: next.type, view: next.view }),
      );
    } catch {
      /* storage bloqueado — o filtro ainda vale na sessão */
    }
  };
  // Collapsed project cards, persisted as one map so a reload keeps the layout.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('deployhub:projects-collapsed');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const toggleCollapsed = (projectId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [projectId]: !prev[projectId] };
      try {
        localStorage.setItem('deployhub:projects-collapsed', JSON.stringify(next));
      } catch {
        /* storage cheio ou bloqueado — o toggle ainda vale na sessão */
      }
      return next;
    });
  };
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoading(true);
    
    try {
      // Use Promise.allSettled to prevent one failing request from blocking others
      const [appsResult, statsResult, logsResult, projectsResult] = await Promise.allSettled([
        api.getApps(),
        api.getStats(),
        api.getSystemLogs({ limit: 10 }),
        api.getProjects(),
      ]);
      
      console.log('Apps result:', appsResult);
      console.log('Stats result:', statsResult);
      
      if (appsResult.status === 'fulfilled') {
        console.log('Setting apps:', appsResult.value);
        setApps(appsResult.value || []);
      } else {
        console.error('Failed to load apps:', appsResult.reason);
      }
      
      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      } else {
        console.error('Failed to load stats:', statsResult.reason);
      }
      
      if (logsResult.status === 'fulfilled') {
        setLogs(logsResult.value || []);
      } else {
        console.error('Failed to load logs:', logsResult.reason);
      }

      if (projectsResult.status === 'fulfilled') setProjects(projectsResult.value || []);

      setLastUpdated(new Date());
    } catch (error: any) {
      console.error('Dashboard refresh error:', error);
      if (showLoader) {
        toast.error(error.message || 'Erro ao carregar dados');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Real-time polling for metrics
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      loadData(false);
    }, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loadData]);

  if (isLoading) {
    // Esqueleto com o formato do conteúdo real: a tela não "pula" quando os dados
    // chegam, e dá para ver o que está vindo.
    return (
      <Layout>
        <div className="mb-6 md:mb-8 grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <StatsCardSkeleton key={index} />
          ))}
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <AppCardSkeleton key={index} />
          ))}
        </div>
      </Layout>
    );
  }

  // `hasProblem` vem da API: status real != running enquanto o operador quer running.
  // Contar só `status === 'error'` deixava o card em 0 mesmo com app caído, porque o
  // PM2 reporta processo morto como 'stopped'/'errored', não 'error'.
  const errorApps = apps.filter((app) => app.hasProblem ?? app.status === 'error').length;

  const handleDeleteProject = async (project: any) => {
    try {
      await api.deleteProject(project.id);
      toast.success(`Projeto ${project.name} excluído`);
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir projeto');
    }
  };

  const handleGenerateSsl = async (project: any) => {
    setSslLoading(project.id);
    const t = toast.loading(`Gerando SSL de ${project.name}...`);
    try {
      const res = await api.generateProjectSsl(project.id);
      const results = res.results || [];
      const failed = results.filter((r) => !r.ok);
      if (results.length === 0) {
        toast.info(res.message || 'Nenhum domínio configurado', { id: t });
      } else if (failed.length === 0) {
        toast.success(`SSL gerado: ${results.length}/${results.length} domínios OK`, { id: t });
      } else {
        toast.error(`${results.length - failed.length}/${results.length} OK · falhou: ${failed.map((r) => r.domain).join(', ')}`, { id: t });
      }
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao gerar SSL', { id: t });
    } finally {
      setSslLoading(null);
    }
  };

  const projectIds = new Set(projects.map((p) => p.id));
  const visibleApps = filterApps(apps, filters);
  const standaloneApps = visibleApps.filter((a) => !a.projectId || !projectIds.has(a.projectId));
  const appsByProject = (pid: string) => visibleApps.filter((a) => a.projectId === pid);
  const isCompact = filters.view === 'compact';
  /** Projeto só aparece se algum service dele passou pelo filtro. */
  const visibleProjects = projects.filter((project) => appsByProject(project.id).length > 0);

  return (
    <Layout>
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm md:text-base text-muted-foreground">
            Gerencie seus deploys e monitore suas aplicações
          </p>
        </div>
        <Button asChild variant="gradient" size="default" className="w-full sm:w-auto">
          <Link to="/deploy">
            <Plus className="h-5 w-5" />
            Novo Deploy
          </Link>
        </Button>
      </div>

      <div className="mb-6 md:mb-8 grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Apps"
          value={stats?.totalApps || 0}
          subtitle="Aplicações deployadas"
          icon={<Server className="h-5 w-5 md:h-6 md:w-6" />}
        />
        <StatsCard
          title="Rodando"
          value={stats?.runningApps || 0}
          subtitle="Processos ativos"
          icon={<Activity className="h-5 w-5 md:h-6 md:w-6" />}
        />
        <StatsCard
          title="Total Deploys"
          value={stats?.totalDeploys || 0}
          subtitle="Todos os tempos"
          icon={<Rocket className="h-5 w-5 md:h-6 md:w-6" />}
        />
        <StatsCard
          title="Problemas"
          value={errorApps}
          subtitle="Fora do ar sem ter sido parados"
          icon={<AlertCircle className="h-5 w-5 md:h-6 md:w-6" />}
          className={errorApps > 0 ? 'border-destructive/30' : ''}
        />
      </div>

      <div className="grid gap-6 md:gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 space-y-4">
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Aplicações</h2>
            {apps.length > 0 && (
              <AppFilters
                value={filters}
                onChange={updateFilters}
                showing={visibleApps.length}
                total={apps.length}
              />
            )}
          </div>
          {apps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 md:p-12 text-center">
              <Server className="mx-auto h-10 w-10 md:h-12 md:w-12 text-muted-foreground" />
              <h3 className="mt-4 text-base md:text-lg font-medium">Nenhuma aplicação</h3>
              <p className="mt-2 text-sm text-muted-foreground">Comece fazendo seu primeiro deploy</p>
              <Button asChild variant="gradient" className="mt-4"><Link to="/deploy">Novo Deploy</Link></Button>
            </div>
          ) : (
            <div className="space-y-6">
              {visibleProjects.map((project) => {
                const svcs = appsByProject(project.id);
                const running = svcs.filter((a) => a.status === 'running').length;
                const errored = svcs.filter((a) => a.status === 'error').length;
                const isOpen = !collapsed[project.id];
                return (
                  <Collapsible
                    key={project.id}
                    open={isOpen}
                    onOpenChange={() => toggleCollapsed(project.id)}
                    className="rounded-xl border border-border bg-card/40 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2 px-1">
                      <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
                        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !isOpen && '-rotate-90')} />
                        <div>
                          <Link
                            to={`/projects/${project.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm font-semibold text-foreground hover:text-primary"
                          >
                            {project.name}
                          </Link>
                          <p className="text-xs text-muted-foreground font-mono">
                            {project.branch} · {project.packageManager || '—'} · {svcs.length} services · {running} running
                            {errored > 0 ? ` · ${errored} erro` : ''}
                          </p>
                        </div>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" disabled={sslLoading === project.id} onClick={() => handleGenerateSsl(project)} title="Gerar/renovar certificado SSL de todos os domínios do projeto">
                          {sslLoading === project.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          Gerar SSL
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => api.redeployProject(project.id).then(() => toast.success('Redeploy iniciado')).catch((e) => toast.error(e.message))}>
                          Redeploy project
                        </Button>
                        {/* Confirmação digitada: excluir um projeto derruba TODOS os
                            services dele de uma vez. */}
                        <ConfirmDeleteDialog
                          name={project.name}
                          title={`Excluir projeto ${project.name}?`}
                          description={
                            <>
                              <p>
                                Para e remove os {svcs.length} services do projeto — processos PM2,
                                containers, configs do Nginx, arquivos em /var/www e o
                                <span className="font-mono"> ~/apps/{project.name}</span> inteiro.
                              </p>
                              <p>Esta ação é irreversível.</p>
                            </>
                          }
                          confirmLabel="Excluir projeto"
                          onConfirm={() => handleDeleteProject(project)}
                          trigger={
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir projeto">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </div>
                    </div>
                    <CollapsibleContent>
                      {isCompact ? (
                        <div className="space-y-1.5">
                          {svcs.map((app) => (
                            <AppCompactRow key={app.id} app={app} />
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                          {svcs.map((app) => (
                            <AppCard key={app.id} app={app} onRefresh={loadData} lastUpdated={lastUpdated} />
                          ))}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
              {standaloneApps.length > 0 &&
                (isCompact ? (
                  <div className="space-y-1.5">
                    {standaloneApps.map((app) => (
                      <AppCompactRow key={app.id} app={app} />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                    {standaloneApps.map((app) => (
                      <AppCard key={app.id} app={app} onRefresh={loadData} lastUpdated={lastUpdated} />
                    ))}
                  </div>
                ))}

              {visibleApps.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhum app corresponde aos filtros.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => updateFilters(DEFAULT_APP_FILTERS)}>
                    Limpar filtros
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 md:space-y-6">
          <div className="rounded-xl border border-border bg-card p-4 md:p-6">
            <h3 className="mb-4 md:mb-6 font-semibold text-foreground text-sm md:text-base">Uso de recursos</h3>
            <div className="flex items-start justify-between gap-2 sm:gap-3">
              <UsageChart label="CPU" value={stats?.cpuUsage || 0} color="primary" />
              <UsageChart label="Memória" value={stats?.memoryUsage || 0} color="cyan" />
              <UsageChart label="Disco" value={stats?.diskUsage || 0} color="warning" />
            </div>
          </div>
          <RecentActivity logs={logs} />
        </div>
      </div>
    </Layout>
  );
}
