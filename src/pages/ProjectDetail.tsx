import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
import { EnvEditor } from '@/components/apps/EnvEditor';
import { AddServiceForm } from '@/components/projects/AddServiceForm';
import { DeployLogPanel } from '@/components/projects/DeployLogPanel';
import { ServiceConfigCard } from '@/components/projects/ServiceConfigCard';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projectEnv, setProjectEnv] = useState('');
  const [savingEnv, setSavingEnv] = useState(false);
  const [sslLoading, setSslLoading] = useState(false);

  const load = useCallback(
    async (withEnv = false) => {
      if (!id) return;
      try {
        const p = await api.getProject(id);
        setProject(p);
        if (withEnv) setProjectEnv(p.envVars || '');
      } catch (e: any) {
        toast.error(e.message || 'Erro ao carregar projeto');
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Keep service status/uptime fresh while a deploy runs.
  useEffect(() => {
    const t = setInterval(() => load(false), 5000);
    return () => clearInterval(t);
  }, [load]);

  const handleSaveEnv = async () => {
    if (!id) return;
    setSavingEnv(true);
    try {
      await api.updateProject(id, { envVars: projectEnv });
      toast.success('Env do projeto salvo — aplica no próximo deploy');
      load(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSavingEnv(false);
    }
  };

  const handleRedeployProject = async () => {
    if (!id) return;
    try {
      await api.redeployProject(id);
      toast.success('Redeploy do projeto iniciado');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao redeployar');
    }
  };

  const handleGenerateSsl = async () => {
    if (!id) return;
    setSslLoading(true);
    const t = toast.loading('Gerando SSL...');
    try {
      const res = await api.generateProjectSsl(id);
      const results = res.results || [];
      const failed = results.filter((r) => !r.ok);
      if (results.length === 0) toast.info(res.message || 'Nenhum domínio configurado', { id: t });
      else if (failed.length === 0) toast.success(`SSL gerado: ${results.length}/${results.length} domínios OK`, { id: t });
      else toast.error(`${results.length - failed.length}/${results.length} OK · falhou: ${failed.map((r) => r.domain).join(', ')}`, { id: t });
    } catch (e: any) {
      toast.error(e.message || 'Erro ao gerar SSL', { id: t });
    } finally {
      setSslLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    try {
      await api.deleteProject(id);
      toast.success('Projeto excluído');
      navigate('/');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir projeto');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <h3 className="text-lg font-medium">Projeto não encontrado</h3>
          <Button asChild variant="gradient" className="mt-4">
            <Link to="/">Voltar ao Dashboard</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const services = project.apps || [];
  const statusLabel: Record<string, string> =
    { running: 'rodando', stopped: 'parado', error: 'erro', deploying: 'deployando' };

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{project.name}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
              {project.repository} · {project.branch} · {project.packageManager || '—'} · {services.length} services ·{' '}
              <span className={project.status === 'error' ? 'text-destructive' : undefined}>
                {statusLabel[project.status] || project.status}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleRedeployProject}>
              <RefreshCw className="h-4 w-4" />
              Redeploy do projeto
            </Button>
            <Button size="sm" variant="outline" disabled={sslLoading} onClick={handleGenerateSsl}>
              {sslLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Gerar SSL
            </Button>
            <ConfirmDeleteDialog
              name={project.name}
              title={`Excluir projeto ${project.name}?`}
              description={
                <>
                  <p>
                    Para e remove os {services.length} services do projeto — processos PM2,
                    containers, configs do Nginx, arquivos em /var/www e o
                    <span className="font-mono"> ~/apps/{project.name}</span> inteiro.
                  </p>
                  <p>Esta ação é irreversível.</p>
                </>
              }
              confirmLabel="Excluir projeto"
              onConfirm={handleDeleteProject}
              trigger={
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir projeto">
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-3">
          <EnvEditor
            value={projectEnv}
            onChange={setProjectEnv}
            baseline={project.envVars || ''}
            label="Env do projeto"
            description="Compartilhado por todos os services — vira o .env da raiz do monorepo. Aplica no próximo deploy."
          />
          <div className="flex justify-end">
            <Button size="sm" variant="gradient" disabled={savingEnv} onClick={handleSaveEnv}>
              {savingEnv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Services</h2>
          {services.map((svc: any) => (
            <ServiceConfigCard
              key={svc.id}
              app={svc}
              projectId={project.id}
              canRemove={services.length > 1}
              onChanged={() => load(false)}
            />
          ))}
        </div>

        <AddServiceForm projectId={project.id} projectName={project.name} onAdded={() => load(false)} />

        <DeployLogPanel projectName={project.name} />
      </div>
    </Layout>
  );
}
