import { useState, useEffect } from 'react';
import { 
  Server, 
  Rocket, 
  Activity, 
  AlertCircle,
  Plus,
  Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { AppCard } from '@/components/dashboard/AppCard';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { UsageChart } from '@/components/dashboard/UsageChart';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function Dashboard() {
  const [apps, setApps] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [appsData, statsData, logsData] = await Promise.all([
        api.getApps(),
        api.getStats(),
        api.getSystemLogs({ limit: 10 }),
      ]);
      setApps(appsData);
      setStats(statsData);
      setLogs(logsData);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const errorApps = apps.filter(app => app.status === 'error').length;

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Gerencie seus deploys e monitore suas aplicações
          </p>
        </div>
        <Button asChild variant="gradient" size="lg">
          <Link to="/deploy">
            <Plus className="h-5 w-5" />
            Novo Deploy
          </Link>
        </Button>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Apps"
          value={stats?.totalApps || 0}
          subtitle="Aplicações deployadas"
          icon={<Server className="h-6 w-6" />}
        />
        <StatsCard
          title="Rodando"
          value={stats?.runningApps || 0}
          subtitle="Processos ativos"
          icon={<Activity className="h-6 w-6" />}
        />
        <StatsCard
          title="Total Deploys"
          value={stats?.totalDeploys || 0}
          subtitle="Todos os tempos"
          icon={<Rocket className="h-6 w-6" />}
        />
        <StatsCard
          title="Problemas"
          value={errorApps}
          subtitle="Precisam atenção"
          icon={<AlertCircle className="h-6 w-6" />}
          className={errorApps > 0 ? 'border-destructive/30' : ''}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Aplicações</h2>
            <span className="text-sm text-muted-foreground">
              {apps.length} apps · ~/apps
            </span>
          </div>
          {apps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <Server className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">Nenhuma aplicação</h3>
              <p className="mt-2 text-muted-foreground">Comece fazendo seu primeiro deploy</p>
              <Button asChild variant="gradient" className="mt-4">
                <Link to="/deploy">Novo Deploy</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {apps.map((app, index) => (
                <div key={app.id} className={`opacity-0 animate-slide-in stagger-${Math.min(index + 1, 5)}`}>
                  <AppCard app={app} onRefresh={loadData} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-6 font-semibold text-foreground">Uso de Recursos</h3>
            <div className="flex justify-around">
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
