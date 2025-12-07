import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Play, 
  Square, 
  RotateCcw, 
  Trash2, 
  ScrollText,
  ExternalLink,
  MoreVertical,
  Clock,
  GitBranch,
  RefreshCw
} from 'lucide-react';
import { App, AppStatus, AppType } from '@/types/app';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import api from '@/lib/api';

const statusConfig: Record<AppStatus, { label: string; color: string; bg: string }> = {
  running: { label: 'Running', color: 'text-success', bg: 'bg-success' },
  stopped: { label: 'Stopped', color: 'text-muted-foreground', bg: 'bg-muted-foreground' },
  error: { label: 'Error', color: 'text-destructive', bg: 'bg-destructive' },
  deploying: { label: 'Deploying', color: 'text-warning', bg: 'bg-warning' },
};

const typeConfig: Record<AppType, { label: string; color: string }> = {
  nextjs: { label: 'Next.js', color: 'bg-foreground text-background' },
  nestjs: { label: 'NestJS', color: 'bg-destructive text-destructive-foreground' },
  vitejs: { label: 'Vite', color: 'bg-purple-500 text-white' },
};

interface AppCardProps {
  app: App;
  onRefresh?: () => void;
}

export function AppCard({ app, onRefresh }: AppCardProps) {
  const navigate = useNavigate();
  const [isRedeploying, setIsRedeploying] = useState(false);
  const status = statusConfig[app.status] || statusConfig.stopped;
  const type = typeConfig[app.type] || { label: app.type || 'Unknown', color: 'bg-muted text-muted-foreground' };

  const handleRedeploy = async () => {
    try {
      setIsRedeploying(true);
      toast.info(`Starting redeploy for ${app.name}...`);
      await api.redeploy(app.id);
      toast.success(`Redeploy started for ${app.name}`);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to redeploy');
    } finally {
      setIsRedeploying(false);
    }
  };

  const handleRestart = async () => {
    try {
      await api.restartApp(app.id);
      toast.success(`Restarting ${app.name}...`);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to restart');
    }
  };

  const handleStop = async () => {
    try {
      await api.stopApp(app.id);
      toast.success(`Stopping ${app.name}...`);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to stop');
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteApp(app.id);
      toast.success(`Deleted ${app.name}`);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-3">
          <div className={cn('h-3 w-3 rounded-full', status.bg, app.status === 'running' && 'animate-pulse')} />
          <div>
            <h3 className="font-semibold text-foreground">{app.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', type.color)}>
                {type.label}
              </span>
              <span className="text-xs text-muted-foreground">:{app.port}</span>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to={`/logs?app=${app.name}`} className="flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                View Logs
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/versions?app=${app.id}`} className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Rollback
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleRedeploy} 
              disabled={isRedeploying}
              className="flex items-center gap-2 text-cyan-400 focus:text-cyan-400 focus:bg-cyan-400/10"
            >
              <RefreshCw className={cn("h-4 w-4", isRedeploying && "animate-spin")} />
              {isRedeploying ? 'Redeploying...' : 'Pull & Redeploy'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleRestart} className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Restart
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleStop} className="flex items-center gap-2">
              <Square className="h-4 w-4" />
              Stop
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} className="flex items-center gap-2 text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Process
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {app.domain && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Domain</span>
            <a 
              href={`https://${app.domain}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              {app.domain}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <span className={cn('font-medium', status.color)}>{status.label}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Uptime</span>
          <span className="flex items-center gap-1 text-foreground">
            <Clock className="h-3 w-3" />
            {app.uptime}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Branch</span>
          <span className="flex items-center gap-1 text-foreground font-mono text-xs">
            <GitBranch className="h-3 w-3" />
            {app.branch}
          </span>
        </div>

        {app.status === 'running' && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Resources</span>
              <span>{app.cpu}% CPU · {app.memory}MB</span>
            </div>
            <div className="flex gap-1">
              <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500" 
                  style={{ width: `${app.cpu}%` }}
                />
              </div>
              <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                <div 
                  className="h-full bg-cyan-400 transition-all duration-500" 
                  style={{ width: `${Math.min((app.memory || 0) / 10, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span>Last deploy: {app.lastDeploy || 'Never'}</span>
        <span className="font-mono">{app.currentVersion?.slice(0, 16) || 'N/A'}</span>
      </div>
    </div>
  );
}
