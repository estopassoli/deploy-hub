import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { EnvEditor } from '@/components/apps/EnvEditor';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { getConnectedSocket, getSocket } from '@/lib/websocket';
import {
    AlertCircle,
    CheckCircle2,
    GitBranch,
    Globe,
    Loader2,
    Rocket,
    Server,
    ShieldCheck,
    Ban,
    XCircle
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

type DeployStep = 'config' | 'deploying' | 'complete' | 'error';

interface DeployResult {
  success: boolean;
  version: string;
  deploy: {
    id: string;
    appId: string;
    version: string;
    path: string;
    status: string;
  };
}

interface LogLine {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

const levelColors = {
  info: 'text-cyan-400',
  warn: 'text-warning',
  error: 'text-destructive',
  debug: 'text-muted-foreground',
};

function parseLogLevel(message: string): 'info' | 'warn' | 'error' | 'debug' {
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('error') || message.startsWith('❌')) return 'error';
  if (lowerMsg.includes('warn')) return 'warn';
  if (message.startsWith('✓') || message.startsWith('🚀')) return 'info';
  return 'debug';
}

export default function Deploy() {
  const navigate = useNavigate();
  const [step, setStep] = useState<DeployStep>('config');
  const [formData, setFormData] = useState({
    repository: '',
    name: '',
    port: '',
    domain: '',
    type: '',
    branch: 'main',
    installCommand: '',
    buildCommand: '',
    migrateCommand: '',
    startCommand: '',
    appDir: '',
    workspacePackage: '',
    envVars: '',
    generateSSL: false,
  });
  const [portError, setPortError] = useState('');
  const [portChecking, setPortChecking] = useState(false);
  const [deployLogs, setDeployLogs] = useState<LogLine[]>([]);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [cancelling, setCancelling] = useState(false);
  // Os tipos vêm do registro de presets no backend: adicionar um framework lá aparece
  // aqui sozinho, sem tocar no frontend.
  const [presets, setPresets] = useState<Array<{ id: string; label: string; description: string; kind: string }>>([]);

  useEffect(() => {
    api
      .getAppPresets()
      .then(setPresets)
      .catch(() => {
        // Sem a lista, o select fica vazio e o deploy não segue — melhor avisar.
        toast.error('Não foi possível carregar os tipos de aplicação');
      });
  }, []);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const deployCompletionRef = useRef(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.cancelDeploy(formData.name);
      toast.info('Cancelamento solicitado — encerrando a etapa atual...');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível cancelar');
    } finally {
      setCancelling(false);
    }
  };

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deployLogs]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      const socket = getSocket();
      socket.emit('unsubscribe-deploy');
    };
  }, []);

  const addLog = (message: string) => {
    const log: LogLine = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level: parseLogLevel(message),
      message,
    };
    setDeployLogs(prev => [...prev, log]);
  };

  const handlePortChange = async (value: string) => {
    setFormData({ ...formData, port: value });
    setPortError('');

    if (!value || isNaN(parseInt(value))) return;

    const port = parseInt(value);
    
    // Basic validation
    if (port < 1024) {
      setPortError('Portas abaixo de 1024 são reservadas para serviços do sistema');
      return;
    }
    
    if (port === 10000 || port === 10001) {
      setPortError('Esta porta é usada pelo próprio DeployHub');
      return;
    }

    // Check with backend
    setPortChecking(true);
    try {
      const result = await api.checkPort(port);
      if (!result.available) {
        if (result.usedBy) {
          setPortError(`Port ${port} is used by ${result.usedBy}`);
        } else if (result.isSystemPort) {
          setPortError(`Port ${port} é uma porta reservada do sistema`);
        }
      }
    } catch (error) {
      console.error('Error checking port:', error);
    } finally {
      setPortChecking(false);
    }
  };

  const handleDeploy = async () => {
    deployCompletionRef.current = false;
    // Ensure WebSocket is connected BEFORE starting deploy
    const socket = await getConnectedSocket();
    console.log('WebSocket connected, subscribing to deploy logs for:', formData.name);
    const cleanupSocketListeners = () => {
      socket.off('deploy:log', handleDeployLog);
      socket.off('deploy:complete', handleDeployComplete);
      socket.emit('unsubscribe-deploy');
    };

    const finalizeDeploy = (
      success: boolean,
      details?: { version?: string; error?: string; source?: 'ws' | 'http' | 'api-error' }
    ) => {
      if (deployCompletionRef.current) return;
      deployCompletionRef.current = true;

      if (success) {
        addLog('');
        const suffix = details?.source === 'http' ? ' (API confirmation)' : '';
        addLog(`🚀 Deploy completed successfully${suffix}!`);
        if (details?.version) {
          addLog(`  Version: ${details.version}`);
        }
        setStep('complete');
        toast.success('Deploy concluído com sucesso!');
      } else {
        const errorText = details?.error || 'Deploy failed';
        setErrorMessage(errorText);
        addLog('');
        addLog(`❌ Deploy failed: ${errorText}`);
        setStep('error');
        toast.error(errorText);
      }

      cleanupSocketListeners();
    };
    
    const handleDeployLog = (data: { appName: string; message: string }) => {
      console.log('Deploy log received:', data);
      if (data.appName === formData.name) {
        addLog(data.message);
      }
    };

    const handleDeployComplete = (data: { appName: string; success: boolean; error?: string; version?: string }) => {
      console.log('Deploy complete received:', data);
      if (data.appName === formData.name) {
        finalizeDeploy(data.success, { version: data.version, error: data.error, source: 'ws' });
      }
    };

    // Subscribe to events BEFORE starting deploy
    socket.on('deploy:log', handleDeployLog);
    socket.on('deploy:complete', handleDeployComplete);
    socket.emit('subscribe-deploy', { appName: formData.name });
    
    // Small delay to ensure subscription is registered on server
    await new Promise(resolve => setTimeout(resolve, 100));

    setStep('deploying');
    setDeployLogs([]);
    addLog('▶ Starting deploy process...');
    addLog(`  Repository: ${formData.repository}`);
    addLog(`  App: ${formData.name}`);
    addLog(`  Type: ${formData.type}`);
    addLog(`  Port: ${formData.port}`);
    addLog(`  Branch: ${formData.branch}`);
    addLog('');

    try {
      const result = await api.deploy({
        repository: formData.repository,
        name: formData.name,
        port: parseInt(formData.port),
        domain: formData.domain || undefined,
        type: formData.type,
        branch: formData.branch,
        installCommand: formData.installCommand || undefined,
        buildCommand: formData.buildCommand || undefined,
        migrateCommand: formData.migrateCommand || undefined,
        startCommand: formData.startCommand || undefined,
        appDir: formData.appDir || undefined,
        workspacePackage: formData.workspacePackage || undefined,
        envVars: formData.envVars || undefined,
        generateSSL: formData.generateSSL,
      });

      // If we get a result with success: false, handle as error
      if (result && result.success === false) {
        const errorMsg = result.error || result.message || 'Deploy failed';
        setErrorMessage(errorMsg);
        addLog('');
        addLog(`❌ Deploy failed: ${errorMsg}`);
        setStep('error');
        toast.error(errorMsg);
        socket.off('deploy:log', handleDeployLog);
        socket.off('deploy:complete', handleDeployComplete);
        return;
      }

      setDeployResult(result);
      if (result?.success !== false) {
        finalizeDeploy(true, { version: result?.version, source: 'http' });
      } else {
        finalizeDeploy(false, { error: result?.error || 'Deploy failed', source: 'http' });
      }
    } catch (error: any) {
      // Handle ALL API errors - this means the deploy failed
      const errorMsg = error.response?.data?.message || error.message || 'Deploy failed';
      finalizeDeploy(false, { error: errorMsg, source: 'api-error' });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (portError || portChecking) return;
    if (!formData.type) {
      toast.error('Selecione o tipo do app');
      return;
    }
    handleDeploy();
  };

  const resetForm = () => {
    setStep('config');
    setFormData({
      repository: '',
      name: '',
      port: '',
      domain: '',
      type: '',
      branch: 'main',
      installCommand: '',
      buildCommand: '',
      migrateCommand: '',
      startCommand: '',
      appDir: '',
      workspacePackage: '',
      envVars: '',
      generateSSL: false,
    });
    setDeployLogs([]);
    setDeployResult(null);
    setErrorMessage('');
    deployCompletionRef.current = false;
  };

  const retryDeploy = () => {
    setStep('config');
    setDeployLogs([]);
    setDeployResult(null);
    setErrorMessage('');
    deployCompletionRef.current = false;
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl overflow-hidden">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Novo deploy</h1>
          <p className="mt-1 text-muted-foreground">
            Publique uma nova aplicação no seu servidor
          </p>
        </div>

        {/* Steps Indicator */}
        <div className="mb-8 flex items-center gap-4">
          {['Configurar', 'Deploy', 'Concluído'].map((label, index) => {
            const stepIndex = step === 'error' ? 1 : ['config', 'deploying', 'complete'].indexOf(step);
            const isActive = index === stepIndex;
            const isComplete = stepIndex > index;
            const isError = step === 'error' && index === 1;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all',
                  isActive && !isError && 'bg-primary text-primary-foreground',
                  isError && 'bg-destructive text-destructive-foreground',
                  isComplete && 'bg-success text-success-foreground',
                  !isActive && !isComplete && !isError && 'bg-secondary text-muted-foreground'
                )}>
                  {isComplete ? <CheckCircle2 className="h-4 w-4" /> : isError ? <XCircle className="h-4 w-4" /> : index + 1}
                </div>
                <span className={cn(
                  'text-sm font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {label}
                </span>
                {index < 2 && (
                  <div className={cn(
                    'h-px w-12',
                    isComplete ? 'bg-success' : isError && index === 1 ? 'bg-destructive' : 'bg-border'
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Config Form */}
        {step === 'config' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="repository" className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  URL do repositório
                </Label>
                <Input
                  id="repository"
                  placeholder="git@github.com:user/repo.git"
                  value={formData.repository}
                  onChange={(e) => setFormData({ ...formData, repository: e.target.value })}
                  required
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  O servidor precisa ter acesso SSH a este repositório
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    Nome do app
                  </Label>
                  <Input
                    id="name"
                    placeholder="my-app"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                    required
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    placeholder="main"
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <div className="relative">
                    <Input
                      id="port"
                      type="number"
                      placeholder="3000"
                      value={formData.port}
                      onChange={(e) => handlePortChange(e.target.value)}
                      required
                      className={cn('font-mono pr-8', portError && 'border-destructive')}
                    />
                    {portChecking && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {portError && (
                    <p className="flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {portError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="domain" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Domínio (opcional)
                  </Label>
                  <Input
                    id="domain"
                    placeholder="app.example.com"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Tipo do app</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-3 w-3 rounded-sm',
                              preset.kind === 'static' ? 'bg-purple-500' : 'bg-primary',
                            )}
                            title={preset.kind === 'static' ? 'Servido pelo Nginx' : 'Processo supervisionado'}
                          />
                          <span>{preset.label}</span>
                          <span className="text-xs text-muted-foreground">— {preset.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <EnvEditor
                value={formData.envVars}
                onChange={(envVars) => setFormData({ ...formData, envVars })}
                baseline=""
                label="Variáveis de ambiente (opcional)"
                description="Viram o arquivo .env da release. Chaves NEXT_PUBLIC_ e VITE_ são embutidas no build."
              />

              {/* Custom Commands Section */}
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Comandos customizados (opcional)
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="installCommand" className="text-xs">Install Command</Label>
                    <Input
                      id="installCommand"
                      placeholder="npm ci (default)"
                      value={formData.installCommand}
                      onChange={(e) => setFormData({ ...formData, installCommand: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buildCommand" className="text-xs">Build Command</Label>
                    <Input
                      id="buildCommand"
                      placeholder="npm run build (default)"
                      value={formData.buildCommand}
                      onChange={(e) => setFormData({ ...formData, buildCommand: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="migrateCommand" className="text-xs">Migrate Command</Label>
                    <Input
                      id="migrateCommand"
                      placeholder="npx prisma migrate deploy (Prisma)"
                      value={formData.migrateCommand}
                      onChange={(e) => setFormData({ ...formData, migrateCommand: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startCommand" className="text-xs">Start Command</Label>
                    <Input
                      id="startCommand"
                      placeholder="npm run start (default)"
                      value={formData.startCommand}
                      onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Leave blank to use default commands for each step.
                </p>
              </div>

              {/* Monorepo Section */}
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Monorepo (optional)
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="appDir" className="text-xs">App Directory</Label>
                    <Input
                      id="appDir"
                      placeholder="apps/backend"
                      value={formData.appDir}
                      onChange={(e) => setFormData({ ...formData, appDir: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workspacePackage" className="text-xs">Workspace package name</Label>
                    <Input
                      id="workspacePackage"
                      placeholder="@blurp/backend"
                      value={formData.workspacePackage}
                      onChange={(e) => setFormData({ ...formData, workspacePackage: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Fill these for pnpm/yarn workspaces. Install runs at the repo root; build/start are
                  scoped to the package. The .env is written to both the repo root and the app directory.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <input
                  type="checkbox"
                  id="generateSSL"
                  checked={formData.generateSSL}
                  onChange={(e) => setFormData({ ...formData, generateSSL: e.target.checked })}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <Label htmlFor="generateSSL" className="flex items-center gap-2 cursor-pointer">
                    <ShieldCheck className="h-4 w-4 text-success" />
                    Generate SSL Certificate (Certbot)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically generate a free SSL certificate using Let's Encrypt. Requires a valid domain.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => navigate('/')}>
                Cancel
              </Button>
              <Button type="submit" variant="gradient" disabled={!!portError || portChecking || !formData.type}>
                <Rocket className="h-4 w-4" />
                Start Deploy
              </Button>
            </div>
          </form>
        )}

        {/* Deploying */}
        {(step === 'deploying' || step === 'error') && (
          <div className="space-y-4">
            {/* Deploy Info Card */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                {step === 'deploying' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium">
                  {step === 'deploying' ? `Fazendo deploy de ${formData.name}...` : `Deploy falhou: ${formData.name}`}
                </span>
                {step === 'deploying' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto text-destructive hover:text-destructive"
                    disabled={cancelling}
                    onClick={handleCancel}
                    title="Encerra a etapa atual e interrompe o deploy sem trocar o symlink"
                  >
                    {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                    Cancelar
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Repository:</div>
                <div className="font-mono text-xs truncate">{formData.repository}</div>
                <div className="text-muted-foreground">Type:</div>
                <div>{formData.type}</div>
                <div className="text-muted-foreground">Port:</div>
                <div>{formData.port}</div>
                <div className="text-muted-foreground">Branch:</div>
                <div>{formData.branch}</div>
                {formData.domain && (
                  <>
                    <div className="text-muted-foreground">Domain:</div>
                    <div>{formData.domain}</div>
                  </>
                )}
              </div>
            </div>

            {/* Real-time Logs - Same style as /logs page */}
            <div className="rounded-xl border border-border bg-background overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-destructive/80" />
                  <div className="h-3 w-3 rounded-full bg-warning/80" />
                  <div className="h-3 w-3 rounded-full bg-success/80" />
                </div>
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  deploy --app {formData.name}
                </span>
                <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                  <div className={cn('h-2 w-2 rounded-full', step === 'deploying' ? 'bg-success animate-pulse' : 'bg-destructive')} />
                  {step === 'deploying' ? 'Streaming' : 'Failed'}
                  <span>·</span>
                  <span>{deployLogs.length} lines</span>
                </div>
              </div>
              <div className="h-[400px] overflow-auto p-4 font-mono text-sm terminal-scroll">
                {deployLogs.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Aguardando logs...
                  </div>
                ) : (
                  deployLogs.map((log) => (
                    <div key={log.id} className="flex gap-2 py-0.5 hover:bg-secondary/30">
                      <span className="text-muted-foreground shrink-0">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                      <span className={cn('shrink-0 font-semibold uppercase w-12', levelColors[log.level])}>
                        [{log.level.slice(0, 4)}]
                      </span>
                      <span className="text-foreground/90 break-all">
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

            {step === 'error' && (
              <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={retryDeploy}>
                  Try Again
                </Button>
                <Button variant="default" onClick={() => navigate('/')}>
                  Go to Dashboard
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Complete */}
        {step === 'complete' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-success/30 bg-success/5 p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/20">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Deploy Successful!</h2>
              <p className="mt-2 text-muted-foreground">
                Your application is now running
                {formData.domain && (
                  <> at{' '}
                    <a 
                      href={`https://${formData.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {formData.domain}
                    </a>
                  </>
                )}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 font-semibold text-foreground">Deploy Details</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Nome do app</dt>
                  <dd className="font-mono text-foreground">{formData.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Port</dt>
                  <dd className="font-mono text-foreground">{formData.port}</dd>
                </div>
                {formData.domain && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Domain</dt>
                    <dd className="font-mono text-foreground">{formData.domain}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="text-foreground">{formData.type}</dd>
                </div>
                {deployResult && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Version</dt>
                      <dd className="font-mono text-foreground">{deployResult.version}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Path</dt>
                      <dd className="font-mono text-foreground text-xs">{deployResult.deploy.path}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={resetForm}>
                Deploy Another
              </Button>
              <Button variant="gradient" onClick={() => navigate('/')}>
                Go to Dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
