import { 
  Server, 
  Rocket, 
  Activity, 
  AlertCircle,
  Plus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { AppCard } from '@/components/dashboard/AppCard';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { UsageChart } from '@/components/dashboard/UsageChart';
import { Button } from '@/components/ui/button';
import { mockApps, mockLogs, mockSystemStats } from '@/data/mockData';

export default function Dashboard() {
  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your deployments and monitor your applications
          </p>
        </div>
        <Button asChild variant="gradient" size="lg">
          <Link to="/deploy">
            <Plus className="h-5 w-5" />
            New Deploy
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Apps"
          value={mockSystemStats.totalApps}
          subtitle="Deployed applications"
          icon={<Server className="h-6 w-6" />}
        />
        <StatsCard
          title="Running"
          value={mockSystemStats.runningApps}
          subtitle="Active processes"
          icon={<Activity className="h-6 w-6" />}
          trend={{ value: 12, isPositive: true }}
        />
        <StatsCard
          title="Total Deploys"
          value={mockSystemStats.totalDeploys}
          subtitle="All time"
          icon={<Rocket className="h-6 w-6" />}
        />
        <StatsCard
          title="Issues"
          value={1}
          subtitle="Needs attention"
          icon={<AlertCircle className="h-6 w-6" />}
          className="border-destructive/30"
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Apps List */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Applications</h2>
            <span className="text-sm text-muted-foreground">
              {mockApps.length} apps · ~/apps
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {mockApps.map((app, index) => (
              <div 
                key={app.id} 
                className={`opacity-0 animate-slide-in stagger-${Math.min(index + 1, 5)}`}
              >
                <AppCard app={app} />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Resource Usage */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-6 font-semibold text-foreground">Resource Usage</h3>
            <div className="flex justify-around">
              <UsageChart 
                label="CPU" 
                value={mockSystemStats.cpuUsage} 
                color="primary"
                subtitle="4 cores"
              />
              <UsageChart 
                label="Memory" 
                value={mockSystemStats.memoryUsage} 
                color="cyan"
                subtitle="8GB"
              />
              <UsageChart 
                label="Disk" 
                value={mockSystemStats.diskUsage} 
                color="warning"
                subtitle="100GB"
              />
            </div>
          </div>

          {/* Recent Activity */}
          <RecentActivity logs={mockLogs} />
        </div>
      </div>
    </Layout>
  );
}
