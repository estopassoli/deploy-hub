import { useState } from 'react';
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
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type DeployStep = 'config' | 'deploying' | 'complete';

export default function Deploy() {
  const [step, setStep] = useState<DeployStep>('config');
  const [formData, setFormData] = useState({
    repository: '',
    name: '',
    port: '',
    domain: '',
    type: '',
    branch: 'main',
  });
  const [portError, setPortError] = useState('');
  const [deployLogs, setDeployLogs] = useState<string[]>([]);

  const usedPorts = [3000, 3001, 3002, 3003, 8080];

  const handlePortChange = (value: string) => {
    const port = parseInt(value);
    if (usedPorts.includes(port)) {
      setPortError(`Port ${port} is already in use. Try another.`);
    } else {
      setPortError('');
    }
    setFormData({ ...formData, port: value });
  };

  const simulateDeploy = () => {
    setStep('deploying');
    const logs = [
      '▶ Cloning repository...',
      '✓ Repository cloned successfully',
      '▶ Installing dependencies...',
      '  npm install',
      '✓ Dependencies installed (234 packages)',
      '▶ Detecting Prisma...',
      '  Found prisma/schema.prisma',
      '▶ Running prisma generate...',
      '✓ Prisma client generated',
      '▶ Building application...',
      '  npm run build',
      '✓ Build completed successfully',
      '▶ Creating release directory...',
      '  ~/apps/' + formData.name + '/releases/2025-12-07_10-45-00',
      '✓ Release directory created',
      '▶ Updating symlink...',
      '  ~/apps/' + formData.name + '/current → releases/2025-12-07_10-45-00',
      '✓ Symlink updated',
      '▶ Starting PM2 process...',
      '  pm2 start ecosystem.config.js --name ' + formData.name,
      '✓ PM2 process started',
      '▶ Configuring Nginx...',
      '  Creating proxy for ' + formData.domain + ' → localhost:' + formData.port,
      '✓ Nginx configured and reloaded',
      '',
      '🚀 Deploy completed successfully!',
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < logs.length) {
        setDeployLogs(prev => [...prev, logs[index]]);
        index++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setStep('complete');
          toast.success('Deploy completed successfully!');
        }, 500);
      }
    }, 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (portError) return;
    simulateDeploy();
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
    });
    setDeployLogs([]);
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
            const isActive = index === ['config', 'deploying', 'complete'].indexOf(step);
            const isComplete = ['config', 'deploying', 'complete'].indexOf(step) > index;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all',
                  isActive && 'bg-primary text-primary-foreground',
                  isComplete && 'bg-success text-success-foreground',
                  !isActive && !isComplete && 'bg-secondary text-muted-foreground'
                )}>
                  {isComplete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
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
                    isComplete ? 'bg-success' : 'bg-border'
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
                  <Input
                    id="port"
                    type="number"
                    placeholder="3000"
                    value={formData.port}
                    onChange={(e) => handlePortChange(e.target.value)}
                    required
                    className={cn('font-mono', portError && 'border-destructive')}
                  />
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
                    Domain
                  </Label>
                  <Input
                    id="domain"
                    placeholder="app.example.com"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">App Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select app type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nextjs">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-foreground" />
                        Next.js
                      </div>
                    </SelectItem>
                    <SelectItem value="nestjs">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-destructive" />
                        NestJS
                      </div>
                    </SelectItem>
                    <SelectItem value="vitejs">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-purple-500" />
                        Vite.js (Static)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" variant="gradient" disabled={!!portError}>
                <Rocket className="h-4 w-4" />
                Start Deploy
              </Button>
            </div>
          </form>
        )}

        {/* Deploying */}
        {step === 'deploying' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">Deploying {formData.name}...</span>
              </div>
              <div className="h-[400px] overflow-auto bg-background p-4 font-mono text-sm terminal-scroll">
                {deployLogs.map((log, index) => (
                  <div 
                    key={index} 
                    className={cn(
                      'py-0.5',
                      log.startsWith('✓') && 'text-success',
                      log.startsWith('▶') && 'text-primary',
                      log.startsWith('🚀') && 'text-primary font-bold',
                      log.startsWith('  ') && 'text-muted-foreground pl-4'
                    )}
                  >
                    {log || '\u00A0'}
                  </div>
                ))}
              </div>
            </div>
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
                Your application is now live at{' '}
                <a 
                  href={`https://${formData.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {formData.domain}
                </a>
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
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Domain</dt>
                  <dd className="font-mono text-foreground">{formData.domain}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="text-foreground">{formData.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Path</dt>
                  <dd className="font-mono text-foreground">~/apps/{formData.name}/current</dd>
                </div>
              </dl>
            </div>

            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={resetForm}>
                Deploy Another
              </Button>
              <Button variant="gradient" asChild>
                <a href="/">Go to Dashboard</a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
