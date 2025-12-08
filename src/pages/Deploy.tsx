import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { 
  GitBranch, 
  Rocket, 
  Server, 
  Globe, 
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle,
  ShieldCheck,
  Package,
  Hammer,
  Database,
  Play,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { getSocket } from '@/lib/websocket';

type DeployStep = 'config' | 'deploying' | 'complete' | 'error';
type DeployPhase = 'cloning' | 'installing' | 'building' | 'migrating' | 'starting' | 'configuring' | 'done';

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

const DEPLOY_PHASES: { key: DeployPhase; label: string; icon: string }[] = [
  { key: 'cloning', label: 'Clonando', icon: 'GitBranch' },
  { key: 'installing', label: 'Instalando', icon: 'Package' },
  { key: 'building', label: 'Buildando', icon: 'Hammer' },
  { key: 'migrating', label: 'Migrando', icon: 'Database' },
  { key: 'starting', label: 'Iniciando', icon: 'Play' },
  { key: 'configuring', label: 'Configurando', icon: 'Settings' },
];

function detectPhase(logs: string[]): DeployPhase {
  const allLogs = logs.join('\n').toLowerCase();
  
  if (allLogs.includes('nginx') || allLogs.includes('ssl') || allLogs.includes('certbot')) return 'configuring';
  if (allLogs.includes('pm2') || allLogs.includes('starting app') || allLogs.includes('start command')) return 'starting';
  if (allLogs.includes('prisma') || allLogs.includes('migrate')) return 'migrating';
  if (allLogs.includes('build') || allLogs.includes('compil') || allLogs.includes('nest build') || allLogs.includes('next build')) return 'building';
  if (allLogs.includes('npm ci') || allLogs.includes('npm install') || allLogs.includes('installing dep')) return 'installing';
  if (allLogs.includes('clone') || allLogs.includes('git')) return 'cloning';
  
  return 'cloning';
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
    envVars: '',
    generateSSL: false,
  });
  const [portError, setPortError] = useState('');
  const [portChecking, setPortChecking] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const currentPhase = detectPhase(deployLogs);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deployLogs]);

  // Listen for deploy logs via WebSocket
  useEffect(() => {
    if (step !== 'deploying' || !formData.name) return;

    const socket = getSocket();
    
    // Subscribe to deploy logs for this app
    socket.emit('subscribe-deploy', { appName: formData.name });
    
    const handleDeployLog = (data: { appName: string; message: string }) => {
      console.log('Deploy log received:', data);
      if (data.appName === formData.name) {
        setDeployLogs(prev => [...prev, data.message]);
      }
    };

    socket.on('deploy:log', handleDeployLog);

    return () => {
      socket.off('deploy:log', handleDeployLog);
      socket.emit('unsubscribe-deploy');
    };
  }, [step, formData.name]);

  const handlePortChange = async (value: string) => {
    setFormData({ ...formData, port: value });
    setPortError('');

    if (!value || isNaN(parseInt(value))) return;

    const port = parseInt(value);
    
    // Basic validation
    if (port < 1024) {
      setPortError('Ports below 1024 are reserved for system services');
      return;
    }
    
    if (port === 10000 || port === 10001) {
      setPortError('This port is used by DeployHub');
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
          setPortError(`Port ${port} is a system reserved port`);
        }
      }
    } catch (error) {
      console.error('Error checking port:', error);
    } finally {
      setPortChecking(false);
    }
  };

  const handleDeploy = async () => {
    setStep('deploying');
    setDeployLogs([
      '▶ Starting deploy process...',
      `  Repository: ${formData.repository}`,
      `  App: ${formData.name}`,
      `  Type: ${formData.type}`,
      `  Port: ${formData.port}`,
      `  Branch: ${formData.branch}`,
      ''
    ]);

    try {
      const result = await api.deploy({
        repository: formData.repository,
        name: formData.name,
        port: parseInt(formData.port),
        domain: formData.domain || undefined,
        type: formData.type as 'nestjs' | 'nextjs' | 'vitejs',
        branch: formData.branch,
        installCommand: formData.installCommand || undefined,
        buildCommand: formData.buildCommand || undefined,
        migrateCommand: formData.migrateCommand || undefined,
        startCommand: formData.startCommand || undefined,
        envVars: formData.envVars || undefined,
        generateSSL: formData.generateSSL,
      });

      setDeployResult(result);
      setDeployLogs(prev => [
        ...prev,
        '',
        '🚀 Deploy completed successfully!',
        `  Version: ${result.version}`,
        `  Path: ${result.deploy.path}`
      ]);
      setStep('complete');
      toast.success('Deploy completed successfully!');
    } catch (error: any) {
      setErrorMessage(error.message || 'Deploy failed');
      setDeployLogs(prev => [
        ...prev,
        '',
        `❌ Deploy failed: ${error.message}`
      ]);
      setStep('error');
      toast.error(error.message || 'Deploy failed');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (portError || portChecking) return;
    if (!formData.type) {
      toast.error('Please select an app type');
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
      envVars: '',
      generateSSL: false,
    });
    setDeployLogs([]);
    setDeployResult(null);
    setErrorMessage('');
  };

  const retryDeploy = () => {
    setStep('config');
    setDeployLogs([]);
    setDeployResult(null);
    setErrorMessage('');
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">New Deploy</h1>
          <p className="mt-1 text-muted-foreground">
            Deploy a new application to your server
          </p>
        </div>

        {/* Steps Indicator */}
        <div className="mb-8 flex items-center gap-4">
          {['Configure', 'Deploy', 'Complete'].map((label, index) => {
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
                  SSH Repository URL
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
                  Make sure the server has SSH access to this repository
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    App Name
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
                    Domain (optional)
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
                <Label htmlFor="type">App Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select app type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nextjs">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-foreground" />
                        Next.js (SSR)
                      </div>
                    </SelectItem>
                    <SelectItem value="nestjs">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-destructive" />
                        NestJS (API)
                      </div>
                    </SelectItem>
                    <SelectItem value="vitejs">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-purple-500" />
                        Vite.js (Static SPA)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="envVars" className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Environment Variables (optional)
                </Label>
                <textarea
                  id="envVars"
                  placeholder="DATABASE_URL=postgres://...&#10;SECRET_KEY=abc123&#10;NODE_ENV=production"
                  value={formData.envVars}
                  onChange={(e) => setFormData({ ...formData, envVars: e.target.value })}
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">
                  One variable per line in KEY=value format. Will be saved as .env
                </p>
              </div>

              {/* Custom Commands Section */}
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Custom Commands (optional)
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
            {/* Phase Progress Indicator */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">Progresso do Deploy</span>
                {step === 'deploying' && (
                  <span className="text-xs text-primary flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Em andamento...
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1">
                {DEPLOY_PHASES.map((phase, index) => {
                  const phaseIndex = DEPLOY_PHASES.findIndex(p => p.key === currentPhase);
                  const isActive = phase.key === currentPhase;
                  const isComplete = index < phaseIndex;
                  const isPending = index > phaseIndex;
                  
                  const IconComponent = {
                    GitBranch,
                    Package,
                    Hammer,
                    Database,
                    Play,
                    Settings,
                  }[phase.icon] || Server;
                  
                  return (
                    <div key={phase.key} className="flex flex-col items-center flex-1">
                      <div className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300',
                        isActive && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                        isComplete && 'bg-success text-success-foreground',
                        isPending && 'bg-secondary text-muted-foreground',
                        step === 'error' && isActive && 'bg-destructive text-destructive-foreground ring-4 ring-destructive/20'
                      )}>
                        {isComplete ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : isActive && step === 'deploying' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : step === 'error' && isActive ? (
                          <XCircle className="h-5 w-5" />
                        ) : (
                          <IconComponent className="h-5 w-5" />
                        )}
                      </div>
                      <span className={cn(
                        'text-xs mt-2 text-center',
                        isActive && 'text-primary font-medium',
                        isComplete && 'text-success',
                        isPending && 'text-muted-foreground'
                      )}>
                        {phase.label}
                      </span>
                      {index < DEPLOY_PHASES.length - 1 && (
                        <div className={cn(
                          'absolute h-0.5 w-full top-5 left-1/2',
                          isComplete ? 'bg-success' : 'bg-border'
                        )} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Deploy Info Card */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                {step === 'deploying' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium">
                  {step === 'deploying' ? `Deploying ${formData.name}...` : `Deploy failed: ${formData.name}`}
                </span>
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

            {/* Real-time Logs */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-secondary/30">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm font-medium">Build Logs</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {deployLogs.length} lines
                </span>
              </div>
              <div className="h-[350px] overflow-auto bg-background p-4 font-mono text-xs terminal-scroll">
                {deployLogs.map((log, index) => (
                  <div 
                    key={index} 
                    className={cn(
                      'py-0.5 whitespace-pre-wrap break-all',
                      log?.startsWith('✓') && 'text-success',
                      log?.startsWith('▶') && 'text-primary font-semibold',
                      log?.startsWith('🚀') && 'text-primary font-bold',
                      log?.startsWith('❌') && 'text-destructive font-bold',
                      log?.startsWith('$') && 'text-yellow-500',
                      log?.includes('error') && 'text-destructive',
                      log?.includes('warning') && 'text-yellow-500',
                      !log?.startsWith('✓') && !log?.startsWith('▶') && !log?.startsWith('🚀') && !log?.startsWith('❌') && !log?.startsWith('$') && 'text-muted-foreground'
                    )}
                  >
                    {log || '\u00A0'}
                  </div>
                ))}
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
                  <dt className="text-muted-foreground">App Name</dt>
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