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
    envVars: '',
    generateSSL: false,
  });
  const [portError, setPortError] = useState('');
  const [portChecking, setPortChecking] = useState(false);
  const [deployLogs, setDeployLogs] = useState<LogLine[]>([]);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

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
    // Ensure WebSocket is connected BEFORE starting deploy
    const socket = await getConnectedSocket();
    console.log('WebSocket connected, subscribing to deploy logs for:', formData.name);
    
    const handleDeployLog = (data: { appName: string; message: string }) => {
      console.log('Deploy log received:', data);
      if (data.appName === formData.name) {
        addLog(data.message);
      }
    };

    const handleDeployComplete = (data: { appName: string; success: boolean; error?: string; version?: string }) => {
      console.log('Deploy complete received:', data);
      if (data.appName === formData.name) {
        if (data.success) {
          addLog('');
          addLog('🚀 Deploy completed successfully!');
          addLog(`  Version: ${data.version}`);
          setStep('complete');
          toast.success('Deploy completed successfully!');
        } else {
          setErrorMessage(data.error || 'Deploy failed');
          addLog('');
          addLog(`❌ Deploy failed: ${data.error}`);
          setStep('error');
          toast.error(data.error || 'Deploy failed');
        }
        // Cleanup listeners after completion
        socket.off('deploy:log', handleDeployLog);
        socket.off('deploy:complete', handleDeployComplete);
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
        type: formData.type as 'nestjs' | 'nextjs' | 'vitejs',
        branch: formData.branch,
        installCommand: formData.installCommand || undefined,
        buildCommand: formData.buildCommand || undefined,
        migrateCommand: formData.migrateCommand || undefined,
        startCommand: formData.startCommand || undefined,
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
      // Note: success completion is handled by WebSocket event
    } catch (error: any) {
      // Handle ALL API errors - this means the deploy failed
      const errorMsg = error.response?.data?.message || error.message || 'Deploy failed';
      setErrorMessage(errorMsg);
      addLog('');
      addLog(`❌ Deploy failed: ${errorMsg}`);
      setStep('error');
      toast.error(errorMsg);
      socket.off('deploy:log', handleDeployLog);
      socket.off('deploy:complete', handleDeployComplete);
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
      <div className="mx-auto max-w-3xl overflow-hidden">
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
                    Waiting for logs...
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
