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
  X,
  AlertTriangle,
  Settings,
  Save,
  Loader2
} from 'lucide-react';
import { App, AppStatus, AppType } from '@/types/app';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [showEnvVarsModal, setShowEnvVarsModal] = useState(false);
  const [envVars, setEnvVars] = useState('');
  const [installCommand, setInstallCommand] = useState('');
  const [buildCommand, setBuildCommand] = useState('');
  const [migrateCommand, setMigrateCommand] = useState('');
  const [startCommand, setStartCommand] = useState('');
  const [isSavingEnvVars, setIsSavingEnvVars] = useState(false);
  const [isLoadingEnvVars, setIsLoadingEnvVars] = useState(false);
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

  const handleOpenEnvVars = async () => {
    setShowEnvVarsModal(true);
    setIsLoadingEnvVars(true);
    try {
      const data = await api.getAppConfig(app.id);
      setEnvVars(data.envVars);
      setInstallCommand(data.installCommand);
      setBuildCommand(data.buildCommand);
      setMigrateCommand(data.migrateCommand);
      setStartCommand(data.startCommand);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load configuration');
    } finally {
      setIsLoadingEnvVars(false);
    }
  };

  const handleSaveEnvVars = async () => {
    setIsSavingEnvVars(true);
    const payload = { envVars, installCommand, buildCommand, migrateCommand, startCommand };
    console.log('[AppCard] Saving config for app:', app.id, payload);
    try {
      const result = await api.updateApp(app.id, payload);
      console.log('[AppCard] Save result:', result);
      toast.success('Configuration saved! Changes will apply on next deploy.');
      setShowEnvVarsModal(false);
      onRefresh?.(); // Refresh to show updated data
    } catch (error: any) {
      console.error('[AppCard] Save error:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setIsSavingEnvVars(false);
    }
  };

  return (
    <>
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
              <DropdownMenuItem onClick={handleOpenEnvVars} className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Environment Variables
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

      {/* Redeploy Modal with Logs */}
      <Dialog open={showRedeployModal} onOpenChange={handleCloseRedeployModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className={cn("h-5 w-5", isRedeploying && "animate-spin text-primary")} />
              Redeploying {app.name}
            </DialogTitle>
            <DialogDescription>
              Pulling latest changes from {app.branch} and rebuilding
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 min-h-[300px] max-h-[400px] overflow-auto rounded-lg border border-border bg-background p-4 font-mono text-sm">
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

          <DialogFooter>
            {deployComplete ? (
              <Button onClick={handleCloseRedeployModal} variant={deploySuccess ? 'default' : 'outline'}>
                {deploySuccess ? 'Done' : 'Close'}
              </Button>
            ) : (
              <Button disabled variant="outline">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Deploying...
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete {app.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the application 
              <strong className="text-foreground"> {app.name}</strong>, stop the PM2 process, 
              and remove the Nginx configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Configuration Modal */}
      <Dialog open={showEnvVarsModal} onOpenChange={setShowEnvVarsModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurações - {app.name}
            </DialogTitle>
            <DialogDescription>
              Configure variáveis de ambiente e comandos customizados. Alterações serão aplicadas no próximo deploy.
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingEnvVars ? (
            <div className="flex h-[200px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="envVars">Variáveis de Ambiente (.env)</Label>
                <Textarea
                  id="envVars"
                  placeholder="DATABASE_URL=postgres://...&#10;API_KEY=your_api_key&#10;NODE_ENV=production"
                  value={envVars}
                  onChange={(e) => setEnvVars(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Uma variável por linha no formato KEY=VALUE. Disponíveis durante build e runtime.
                </p>
              </div>
              
              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-medium mb-3">Comandos Customizados (opcional)</h4>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="installCommand" className="text-xs">Comando de Install</Label>
                    <Input
                      id="installCommand"
                      placeholder="npm ci (padrão automático)"
                      value={installCommand}
                      onChange={(e) => setInstallCommand(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="buildCommand" className="text-xs">Comando de Build</Label>
                    <Input
                      id="buildCommand"
                      placeholder="npm run build (padrão)"
                      value={buildCommand}
                      onChange={(e) => setBuildCommand(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="migrateCommand" className="text-xs">Comando de Migrate</Label>
                    <Input
                      id="migrateCommand"
                      placeholder="npx prisma migrate deploy (padrão para Prisma)"
                      value={migrateCommand}
                      onChange={(e) => setMigrateCommand(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="startCommand" className="text-xs">Comando de Start</Label>
                    <Input
                      id="startCommand"
                      placeholder="npm run start (padrão)"
                      value={startCommand}
                      onChange={(e) => setStartCommand(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Deixe em branco para usar os comandos padrão de cada etapa.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnvVarsModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEnvVars} disabled={isSavingEnvVars || isLoadingEnvVars}>
              {isSavingEnvVars ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}