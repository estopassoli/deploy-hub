import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { getConnectedSocket, getSocket } from '@/lib/websocket';
import { Loader2, Rocket, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

type Step = 'config' | 'configure' | 'deploying' | 'complete' | 'error';

interface ServiceRow {
  include: boolean;
  name: string;
  appDir: string;
  workspacePackage: string;
  type: string;
  port: string;
  domain: string;
  envVars: string;
}

export default function Project() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('config');
  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [projectName, setProjectName] = useState('');
  const [projectEnv, setProjectEnv] = useState('');
  const [generateSSL, setGenerateSSL] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [pm, setPm] = useState('');
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const logsEnd = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);
  useEffect(() => () => { getSocket().emit('unsubscribe-deploy'); }, []);

  const addLog = (m: string) => setLogs((p) => [...p, m]);

  const handleDetect = async () => {
    if (!repository) return toast.error('Informe o repositório');
    setDetecting(true);
    try {
      const res = await api.detectProject({ repository, branch });
      setPm(res.packageManager);
      if (!res.services.length) {
        toast.error('Nenhum app deployável detectado no monorepo');
        return;
      }
      const base = projectName || repository.split('/').pop()?.replace(/\.git$/, '') || 'project';
      if (!projectName) setProjectName(base);
      setServices(
        res.services.map((s) => ({
          include: true,
          name: `${base}-${s.suggestedName}`,
          appDir: s.appDir,
          workspacePackage: s.workspacePackage,
          type: s.type,
          port: s.suggestedPort ? String(s.suggestedPort) : '',
          domain: '',
          envVars: '',
        })),
      );
      setStep('configure');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao detectar');
    } finally {
      setDetecting(false);
    }
  };

  const updateSvc = (i: number, patch: Partial<ServiceRow>) =>
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const handleDeploy = async () => {
    const included = services.filter((s) => s.include);
    if (!projectName) return toast.error('Nome do projeto obrigatório');
    if (!included.length) return toast.error('Selecione ao menos um app');
    if (included.some((s) => !s.port)) return toast.error('Defina a porta de cada app selecionado');

    done.current = false;
    const socket = await getConnectedSocket();
    const onLog = (d: { appName: string; message: string }) => {
      if (d.appName === projectName) addLog(d.message);
    };
    const onComplete = (d: { appName: string; success: boolean; error?: string }) => {
      if (d.appName !== projectName || done.current) return;
      done.current = true;
      socket.off('deploy:log', onLog);
      socket.off('deploy:complete', onComplete);
      socket.emit('unsubscribe-deploy');
      if (d.success) {
        setStep('complete');
        toast.success('Projeto deployado!');
      } else {
        setErrorMsg(d.error || 'Deploy falhou');
        setStep('error');
        toast.error(d.error || 'Deploy falhou');
      }
    };
    socket.on('deploy:log', onLog);
    socket.on('deploy:complete', onComplete);
    socket.emit('subscribe-deploy', { appName: projectName });
    await new Promise((r) => setTimeout(r, 100));

    setStep('deploying');
    setLogs([]);
    addLog(`▶ Deploying project ${projectName} (${included.length} services)...`);
    try {
      await api.createProject({
        name: projectName,
        repository,
        branch,
        envVars: projectEnv || undefined,
        generateSSL,
        services: included.map((s) => ({
          name: s.name,
          appDir: s.appDir,
          workspacePackage: s.workspacePackage || undefined,
          type: s.type,
          port: parseInt(s.port, 10),
          domain: s.domain || undefined,
          envVars: s.envVars || undefined,
        })),
      });
    } catch (e: any) {
      if (!done.current) {
        done.current = true;
        setErrorMsg(e.message || 'Deploy falhou');
        setStep('error');
        toast.error(e.message || 'Deploy falhou');
      }
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">New Monorepo Project</h1>
          <p className="mt-1 text-muted-foreground">One clone + install, many services</p>
        </div>

        {step === 'config' && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repo">SSH Repository URL</Label>
              <Input id="repo" placeholder="git@github.com:user/monorepo.git" value={repository} onChange={(e) => setRepository(e.target.value)} className="font-mono" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input id="branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pname">Project Name</Label>
                <Input id="pname" placeholder="blurp" value={projectName} onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="font-mono" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => navigate('/')}>Cancel</Button>
              <Button variant="gradient" onClick={handleDetect} disabled={detecting || !repository}>
                {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Detect apps
              </Button>
            </div>
          </div>
        )}

        {step === 'configure' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Package manager: <span className="text-foreground font-mono">{pm}</span> · {services.length} apps detected
            </div>
            <div className="space-y-2">
              <Label htmlFor="penv">Project env (shared, written to repo root .env)</Label>
              <textarea id="penv" value={projectEnv} onChange={(e) => setProjectEnv(e.target.value)} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" placeholder="DATABASE_URL=...&#10;REDIS_URL=..." />
            </div>
            {services.map((s, i) => (
              <div key={s.appDir} className={cn('rounded-xl border p-4 space-y-3', s.include ? 'border-border bg-card' : 'border-dashed border-border opacity-60')}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={s.include} onChange={(e) => updateSvc(i, { include: e.target.checked })} className="h-4 w-4" />
                  <span className="font-mono text-sm">{s.workspacePackage}</span>
                  <span className="text-xs text-muted-foreground">({s.type} · {s.appDir})</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={s.name} onChange={(e) => updateSvc(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className="font-mono text-sm" /></div>
                  <div className="space-y-1"><Label className="text-xs">Port</Label><Input type="number" value={s.port} onChange={(e) => updateSvc(i, { port: e.target.value })} className="font-mono text-sm" /></div>
                  <div className="space-y-1"><Label className="text-xs">Domain (optional)</Label><Input value={s.domain} onChange={(e) => updateSvc(i, { domain: e.target.value })} className="font-mono text-sm" placeholder="api.example.com" /></div>
                  <div className="space-y-1"><Label className="text-xs">Type</Label><Input value={s.type} onChange={(e) => updateSvc(i, { type: e.target.value })} className="font-mono text-sm" /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">Service env (written to {s.appDir}/.env)</Label><textarea value={s.envVars} onChange={(e) => updateSvc(i, { envVars: e.target.value })} className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono" placeholder="NEXT_PUBLIC_API_URL=..." /></div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ssl" checked={generateSSL} onChange={(e) => setGenerateSSL(e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="ssl" className="text-sm">Generate SSL (Certbot) for services with a domain</Label>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setStep('config')}>Back</Button>
              <Button variant="gradient" onClick={handleDeploy}><Rocket className="h-4 w-4" />Deploy Project</Button>
            </div>
          </div>
        )}

        {(step === 'deploying' || step === 'error' || step === 'complete') && (
          <div className="space-y-4">
            {step === 'complete' && (
              <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center">
                <h2 className="text-xl font-bold">Project deployed!</h2>
                <p className="text-muted-foreground mt-1">{projectName}</p>
              </div>
            )}
            {step === 'error' && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">Deploy failed: {errorMsg}</div>
            )}
            <div className="rounded-xl border border-border bg-background overflow-hidden">
              <div className="border-b border-border bg-card px-4 py-2 text-xs font-mono text-muted-foreground">deploy --project {projectName}</div>
              <div className="h-[400px] overflow-auto p-4 font-mono text-sm terminal-scroll">
                {logs.map((l, i) => (<div key={i} className="py-0.5 text-foreground/90 break-all">{l}</div>))}
                <div ref={logsEnd} />
              </div>
            </div>
            {(step === 'complete' || step === 'error') && (
              <div className="flex justify-end gap-3">
                <Button variant="gradient" onClick={() => navigate('/')}>Go to Dashboard</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
