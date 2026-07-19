import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Detected {
  appDir: string;
  workspacePackage: string;
  type: string;
  suggestedPort: number | null;
  suggestedName: string;
  hasPrisma: boolean;
}

interface Props {
  projectId: string;
  projectName: string;
  onAdded: () => void;
}

export function AddServiceForm({ projectId, projectName, onAdded }: Props) {
  const [available, setAvailable] = useState<Detected[]>([]);
  const [source, setSource] = useState<'release' | 'repo'>('release');
  const [reason, setReason] = useState<string | undefined>();
  const [scanning, setScanning] = useState(true);
  const [selected, setSelected] = useState<Detected | null>(null);
  const [name, setName] = useState('');
  const [port, setPort] = useState('');
  const [domain, setDomain] = useState('');
  const [envVars, setEnvVars] = useState('');
  const [generateSSL, setGenerateSSL] = useState(false);
  const [adding, setAdding] = useState(false);

  const scan = useCallback(
    async (src: 'release' | 'repo') => {
      setScanning(true);
      try {
        const res = await api.getAvailableServices(projectId, src);
        setAvailable(res.services);
        setSource(res.source);
        setReason(res.reason);
      } catch (e: any) {
        toast.error(e.message || 'Erro ao detectar apps');
      } finally {
        setScanning(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    scan('release');
  }, [scan]);

  const handleSelect = (svc: Detected) => {
    setSelected(svc);
    setName(`${projectName}-${svc.suggestedName}`);
    setPort(svc.suggestedPort ? String(svc.suggestedPort) : '');
    setDomain('');
    setEnvVars('');
  };

  const handleAdd = async () => {
    if (!selected) return;
    if (!name) return toast.error('Informe o nome do service');
    if (!port) return toast.error('Informe a porta');
    setAdding(true);
    try {
      await api.addProjectService(projectId, {
        name,
        appDir: selected.appDir,
        workspacePackage: selected.workspacePackage || undefined,
        type: selected.type,
        port: parseInt(port, 10),
        domain: domain || undefined,
        envVars: envVars || undefined,
        generateSSL,
      });
      toast.success(`${name} adicionado — deploy incremental iniciado`);
      setSelected(null);
      await scan(source);
      onAdded();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao adicionar service');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Adicionar service</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {source === 'release'
            ? 'Apps do monorepo presentes no release atual que ainda não são service. Sobem com deploy incremental — os outros services não reiniciam.'
            : 'Apps encontrados na branch. Um app que não existe no release atual exige um "Redeploy project" antes de subir.'}
        </p>
      </div>

      {scanning ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Detectando apps...
        </div>
      ) : available.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {reason === 'no-release'
            ? 'O projeto ainda não tem release em disco. Rode "Redeploy project" primeiro.'
            : 'Todos os apps do monorepo já são services deste projeto.'}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {available.map((svc) => (
            <button
              key={svc.appDir}
              onClick={() => handleSelect(svc)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                selected?.appDir === svc.appDir ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
              )}
            >
              <div className="font-mono text-sm text-foreground">{svc.workspacePackage}</div>
              <div className="text-xs text-muted-foreground">
                {svc.type} · {svc.appDir}
                {svc.hasPrisma ? ' · prisma' : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {source === 'release' && (
        <Button variant="ghost" size="sm" onClick={() => scan('repo')} disabled={scanning}>
          <Search className="h-4 w-4" />
          Não achou o app? Buscar no repositório
        </Button>
      )}

      {selected && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="font-mono text-sm text-foreground">{selected.workspacePackage}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Porta</Label>
              <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} className="font-mono text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Domínio (opcional)</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} className="font-mono text-sm" placeholder="api.example.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Env do service (vira {selected.appDir}/.env)</Label>
            <textarea
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
              placeholder="JWT_SECRET=..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="add-ssl"
              checked={generateSSL}
              onChange={(e) => setGenerateSSL(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="add-ssl" className="text-sm">
              Gerar SSL (Certbot) se tiver domínio
            </Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
              Cancelar
            </Button>
            <Button variant="gradient" size="sm" disabled={adding} onClick={handleAdd}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar e deployar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
