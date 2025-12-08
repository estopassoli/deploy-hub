import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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
  RefreshCw,
  AlertTriangle,
  Settings,
  Loader2
} from 'lucide-react';
import { App, AppStatus, AppType } from '@/types/app';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AppConfigModal } from './AppConfigModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import api from '@/lib/api';
import { getSocket } from '@/lib/websocket';

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
  const [isRedeploying, setIsRedeploying] = useState(false);
  const [showRedeployModal, setShowRedeployModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployComplete, setDeployComplete] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const status = statusConfig[app.status] || statusConfig.stopped;
  const type = typeConfig[app.type] || { label: app.type || 'Unknown', color: 'bg-muted text-muted-foreground' };

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deployLogs]);

  // Listen for deploy logs via WebSocket
  useEffect(() => {
    if (!showRedeployModal) return;

    const socket = getSocket();
    
    const handleDeployLog = (data: { appName: string; message: string }) => {
      if (data.appName === app.name) {
        setDeployLogs(prev => [...prev, data.message]);
      }
    };

    const handleDeployComplete = (data: { appName: string; success: boolean }) => {
      if (data.appName === app.name) {
        setDeployComplete(true);
        setDeploySuccess(data.success);
        setIsRedeploying(false);
        onRefresh?.();
      }
    };

    socket.on('deploy:log', handleDeployLog);
    socket.on('deploy:complete', handleDeployComplete);

    return () => {
      socket.off('deploy:log', handleDeployLog);
      socket.off('deploy:complete', handleDeployComplete);
    };
  }, [showRedeployModal, app.name, onRefresh]);

  const handleRedeploy = async () => {
    setShowRedeployModal(true);
    setDeployLogs(['▶ Starting redeploy...', `  App: ${app.name}`, `  Branch: ${app.branch}`, '']);
    setDeployComplete(false);
    setDeploySuccess(false);
    
    try {
      setIsRedeploying(true);
      await api.redeploy(app.id);
    } catch (error: any) {
      setDeployLogs(prev => [...prev, '', `❌ Error: ${error.message}`]);
      setDeployComplete(true);
      setDeploySuccess(false);
      setIsRedeploying(false);
    }
  };

  const handleCloseRedeployModal = () => {
    setShowRedeployModal(false);
    setDeployLogs([]);
    setDeployComplete(false);
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
      setShowDeleteConfirm(false);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const handleOpenConfig = () => {
    setShowConfigModal(true);
  };

  return (
    <>
      <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.98] md:active:scale-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-3 md:p-4">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className={cn('h-2.5 w-2.5 md:h-3 md:w-3 flex-shrink-0 rounded-full', status.bg, app.status === 'running' && 'animate-pulse')} />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm md:text-base text-foreground truncate">{app.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] md:text-xs font-medium', type.color)}>
                  {type.label}
                </span>
                <span className="text-[10px] md:text-xs text-muted-foreground">:{app.port}</span>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="flex-shrink-0">
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
              <DropdownMenuItem onClick={handleOpenConfig} className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configurações
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
              <DropdownMenuItem 
                onClick={() => setShowDeleteConfirm(true)} 
                className="flex items-center gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete Process
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Body */}
        <div className="p-3 md:p-4 space-y-2 md:space-y-3">
          {app.domain && (
            <div className="flex items-center justify-between text-xs md:text-sm gap-2">
              <span className="text-muted-foreground flex-shrink-0">Domain</span>
              <a 
                href={`https://${app.domain}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline truncate"
              >
                <span className="truncate">{app.domain}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            </div>
          )}

          <div className="flex items-center justify-between text-xs md:text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className={cn('font-medium', status.color)}>{status.label}</span>
          </div>

          <div className="flex items-center justify-between text-xs md:text-sm">
            <span className="text-muted-foreground">Uptime</span>
            <span className="flex items-center gap-1 text-foreground">
              <Clock className="h-3 w-3" />
              {app.uptime}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs md:text-sm">
            <span className="text-muted-foreground">Branch</span>
            <span className="flex items-center gap-1 text-foreground font-mono text-[10px] md:text-xs">
              <GitBranch className="h-3 w-3" />
              {app.branch}
            </span>
          </div>

          {app.status === 'running' && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between text-[10px] md:text-xs text-muted-foreground mb-1">
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
        <div className="flex items-center justify-between border-t border-border px-3 md:px-4 py-2 md:py-3 text-[10px] md:text-xs text-muted-foreground">
          <span className="truncate">Last deploy: {app.lastDeploy || 'Never'}</span>
          <span className="font-mono flex-shrink-0 ml-2">{app.currentVersion?.slice(0, 12) || 'N/A'}</span>
        </div>
      </div>

      {/* Redeploy Modal with Logs */}
      <Dialog open={showRedeployModal} onOpenChange={handleCloseRedeployModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <RefreshCw className={cn("h-5 w-5 flex-shrink-0", isRedeploying && "animate-spin text-primary")} />
              <span className="truncate">Redeploying {app.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Pulling latest changes from {app.branch} and rebuilding
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 min-h-[200px] max-h-[350px] overflow-auto rounded-lg border border-border bg-background p-3 md:p-4 font-mono text-xs md:text-sm">
            {deployLogs.map((log, index) => (
              <div 
                key={index} 
                className={cn(
                  'py-0.5',
                  log?.startsWith('✓') && 'text-success',
                  log?.startsWith('▶') && 'text-primary',
                  log?.startsWith('🚀') && 'text-primary font-bold',
                  log?.startsWith('❌') && 'text-destructive font-bold',
                  log?.includes('⚠') && 'text-warning',
                  log?.startsWith('  ') && 'text-muted-foreground'
                )}
              >
                {log || '\u00A0'}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>

          <DialogFooter className="pt-4">
            {deployComplete ? (
              <Button onClick={handleCloseRedeployModal} variant={deploySuccess ? 'default' : 'outline'} className="w-full sm:w-auto">
                {deploySuccess ? 'Done' : 'Close'}
              </Button>
            ) : (
              <Button disabled variant="outline" className="w-full sm:w-auto">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Deploying...
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="mx-4 sm:mx-auto max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
              <span className="truncate">Delete {app.name}?</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              This action cannot be undone. This will permanently delete the application 
              <strong className="text-foreground"> {app.name}</strong>, stop the PM2 process, 
              and remove the Nginx configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Configuration Modal */}
      <AppConfigModal
        appId={app.id}
        appName={app.name}
        open={showConfigModal}
        onOpenChange={setShowConfigModal}
        onSaved={onRefresh}
      />
    </>
  );
}