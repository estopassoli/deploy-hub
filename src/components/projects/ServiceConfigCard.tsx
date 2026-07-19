import { useState } from 'react';
import { Loader2, Rocket, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  app: any;
  projectId: string;
  canRemove: boolean;
  onChanged: () => void;
}

export function ServiceConfigCard({ app, projectId, canRemove, onChanged }: Props) {
  const [domain, setDomain] = useState(app.domain || '');
  const [envVars, setEnvVars] = useState(app.envVars || '');
  const [startCommand, setStartCommand] = useState(app.startCommand || '');
  const [migrateCommand, setMigrateCommand] = useState(app.migrateCommand || '');
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Send raw strings (not `|| undefined`) so clearing a field actually clears it:
      // AppsService.update only writes fields that are !== undefined, and maps '' -> null.
      await api.updateApp(app.id, {
        domain,
        envVars,
        startCommand,
        migrateCommand,
      });
      toast.success(`${app.name} salvo — use "Deploy service" para aplicar`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      await api.deployProjectService(projectId, app.id);
      toast.success(`Deploy de ${app.name} iniciado — os outros services seguem rodando`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao deployar service');
    } finally {
      setDeploying(false);
    }
  };

  const handleRemove = async () => {
    try {
      await api.removeProjectService(projectId, app.id);
      toast.success(`${app.name} removido`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao remover service');
    }
  };

  const statusColor =
    app.status === 'running' ? 'bg-success' : app.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground';

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', statusColor)} />
          <span className="font-semibold text-foreground">{app.name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {app.workspacePackage || app.appDir} · {app.type} · :{app.port}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
          <Button size="sm" variant="gradient" disabled={deploying} onClick={handleDeploy} title="Rebuilda e reinicia só este service">
            {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Deploy service
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={!canRemove}
                title={canRemove ? 'Remover service' : 'Último service — exclua o projeto inteiro'}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover {app.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Para o processo PM2, remove o vhost do Nginx e os arquivos em /var/www/{app.name}, e apaga o registro.
                  Os outros services do projeto não são afetados. Esta ação é irreversível.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleRemove}
                >
                  Remover service
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Domínio</Label>
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} className="font-mono text-sm" placeholder="api.example.com" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Start command (opcional)</Label>
          <Input value={startCommand} onChange={(e) => setStartCommand(e.target.value)} className="font-mono text-sm" placeholder="node dist/main.js" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Migrate command (opcional)</Label>
        <Input value={migrateCommand} onChange={(e) => setMigrateCommand(e.target.value)} className="font-mono text-sm" placeholder="pnpm prisma migrate deploy" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Env do service (vira {app.appDir || '.'}/.env)</Label>
        <textarea
          value={envVars}
          onChange={(e) => setEnvVars(e.target.value)}
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
          placeholder="NEXT_PUBLIC_API_URL=..."
        />
      </div>
    </div>
  );
}
