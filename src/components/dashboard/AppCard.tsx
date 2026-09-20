import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
  Ban,
  Loader2,
  TrendingUp,
  RefreshCcw
} from 'lucide-react';
import { App, AppStatus, AppType } from '@/types/app';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AppConfigModal } from './AppConfigModal';
import { AppMetricsChart } from './AppMetricsChart';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
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
  lastUpdated?: Date;
}

export function AppCard({ app, onRefresh, lastUpdated }: AppCardProps) {
  const [isRedeploying, setIsRedeploying] = useState(false);
  const [showRedeployModal, setShowRedeployModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showMetricsModal, setShowMetricsModal] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployComplete, setDeployComplete] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [timeSinceUpdate, setTimeSinceUpdate] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const status = statusConfig[app.status] || statusConfig.stopped;
  const type = typeConfig[app.type] || { label: app.type || 'Unknown', color: 'bg-muted text-muted-foreground' };

  // Update time since last update
  useEffect(() => {
    if (!lastUpdated) return;
    
    const updateTime = () => {
      setTimeSinceUpdate(formatDistanceToNow(lastUpdated, { addSuffix: true, locale: ptBR }));
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

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

  const [isCancelling, setIsCancelling] = useState(false);

  /**
   * Interrompe o deploy em andamento.
   *
   * Para um service de projeto monorepo, a chave do deploy é o nome do PROJETO: o
   * release é compartilhado e é nele que a trava é tomada.
   */
  const handleCancelDeploy = async () => {
    setIsCancelling(true);
    try {
      const key = (app as any).project?.name || app.name;
      await api.cancelDeploy(key);
      toast.info('Cancelamento solicitado — encerrando a etapa atual...');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível cancelar');
    } finally {
      setIsCancelling(false);
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

  const handleStart = async () => {
    try {
      await api.startApp(app.id);
      toast.success(`Starting ${app.name}...`);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to start');
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteApp(app.id);
      toast.success(`${app.name} excluído`);
      setShowDeleteConfirm(false);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir');
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
              {/* O card vira porta de entrada da página de detalhe, onde ficam as
                  releases, os logs e as métricas deste app com o contexto em volta. */}
              <Link
                to={`/apps/${app.id}`}
                className="block truncate text-sm font-semibold text-foreground hover:text-primary md:text-base"
              >
                {app.name}
              </Link>
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
                <Link to={`/apps/${app.id}`} className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Abrir detalhes
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/apps/${app.id}`} className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4" />
                  Ver logs
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/versions?app=${app.id}`} className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Releases e rollback
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenConfig} className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configurações
              </DropdownMenuItem>
              {app.type !== 'vitejs' && (
                <DropdownMenuItem onClick={() => setShowMetricsModal(true)} className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Métricas
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleRedeploy} 
                disabled={isRedeploying}
                className="flex items-center gap-2 text-cyan-400 focus:text-cyan-400 focus:bg-cyan-400/10"
              >
                <RefreshCw className={cn("h-4 w-4", isRedeploying && "animate-spin")} />
                {isRedeploying ? 'Deployando...' : 'Pull e redeploy'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {app.status === 'stopped' ? (
                <DropdownMenuItem onClick={handleStart} className="flex items-center gap-2 text-success focus:text-success focus:bg-success/10">
                  <Play className="h-4 w-4" />
                  Iniciar
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={handleRestart} className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reiniciar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleStop} className="flex items-center gap-2">
                    <Square className="h-4 w-4" />
                    Parar
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowDeleteConfirm(true)} 
                className="flex items-center gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                Excluir app
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Body */}
        <div className="p-3 md:p-4 space-y-2 md:space-y-3">
          {app.domain && (
            <div className="flex items-center justify-between text-xs md:text-sm gap-2">
              <span className="text-muted-foreground flex-shrink-0">Domínio</span>
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

          {(app.status === 'running' || app.type === 'vitejs') && (
            <div className="pt-2 border-t border-border">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] md:text-xs">
                  <span className="text-muted-foreground">CPU</span>
                  <span className="text-foreground">{app.cpu || 0}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500" 
                    style={{ width: `${app.cpu || 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] md:text-xs">
                  <span className="text-muted-foreground">Memória</span>
                  <span className="text-foreground">{app.memory || 0}MB</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
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
        <div className="flex flex-col border-t border-border px-3 md:px-4 py-2 md:py-3 text-[10px] md:text-xs text-muted-foreground gap-1">
          <div className="flex items-center justify-between">
            <span className="truncate">Last deploy: {app.lastDeploy || 'Never'}</span>
            <span className="font-mono flex-shrink-0 ml-2">{app.currentVersion?.slice(0, 12) || 'N/A'}</span>
          </div>
          {timeSinceUpdate && (
            <div className="flex items-center gap-1 text-[9px] md:text-[10px] text-muted-foreground/70">
              <RefreshCcw className="h-2.5 w-2.5" />
              <span>Atualizado {timeSinceUpdate}</span>
            </div>
          )}
        </div>
      </div>

      {/* Redeploy Modal with Logs */}
      <Dialog open={showRedeployModal} onOpenChange={handleCloseRedeployModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <RefreshCw className={cn("h-5 w-5 flex-shrink-0", isRedeploying && "animate-spin text-primary")} />
              <span className="truncate">Redeploy de {app.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Trazendo a última versão de {app.branch} e reconstruindo
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
                {deploySuccess ? 'Concluído' : 'Fechar'}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto text-destructive hover:text-destructive"
                  disabled={isCancelling}
                  onClick={handleCancelDeploy}
                  title="Encerra a etapa atual sem trocar o symlink — o app segue na release anterior"
                >
                  {isCancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
                  Cancelar deploy
                </Button>
                <Button disabled variant="outline" className="w-full sm:w-auto">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Deployando...
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      {/*
        Confirmação por digitação em vez de um clique. Excluir aqui para o processo,
        remove containers e imagens, apaga o vhost do Nginx, o /var/www/<app> e o
        ~/apps/<app> inteiro — com todas as releases. Um clique errado no app errado é
        um incidente de produção.
      */}
      <ConfirmDeleteDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          name={app.name}
          description={
            <>
              <p>Esta ação é irreversível.</p>
              <p>
                Para o processo, remove containers e imagens, apaga o vhost do Nginx,
                <span className="font-mono"> /var/www/{app.name}</span> e
                <span className="font-mono"> ~/apps/{app.name}</span> — com todas as releases.
              </p>
            </>
          }
          confirmLabel={`Excluir ${app.name}`}
          onConfirm={handleDelete}
        />

      {/* Configuration Modal */}
      <AppConfigModal
        appId={app.id}
        appName={app.name}
        open={showConfigModal}
        onOpenChange={setShowConfigModal}
        onSaved={onRefresh}
      />

      {/* Metrics Modal */}
      <AppMetricsChart
        appId={app.id}
        appName={app.name}
        open={showMetricsModal}
        onOpenChange={setShowMetricsModal}
      />
    </>
  );
}