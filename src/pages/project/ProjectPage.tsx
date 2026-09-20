import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { toStatus } from '@/lib/app-status';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout, StatusDot, Tag, aggregateStatus } from '@/components/ds';
import { useViewport } from '@/hooks/useViewport';
import { ProjectProvider } from './ProjectContext';

/**
 * Página de um projeto monorepo — layout route com abas por segmento de URL.
 *
 * ## O status do projeto é derivado, não lido
 *
 * O backend persiste `Project.status`, e ele diverge: o cabeçalho dizia "rodando" com
 * três dos quatro services parados. Aqui a saúde vem dos services, calculada na hora —
 * o pior filho vence.
 */
const ABAS = [
  { to: '', label: 'Services', end: true },
  { to: 'env', label: 'Ambiente' },
  { to: 'deployments', label: 'Deployments' },
  { to: 'settings', label: 'Configurações' },
];

export default function ProjectPage() {
  const { id = '' } = useParams<{ id: string }>();
  const viewport = useViewport();

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sslLoading, setSslLoading] = useState(false);
  const [redeploying, setRedeploying] = useState(false);

  const load = useCallback(async () => {
    try {
      setProject(await api.getProject(id));
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar o projeto');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Status dos services segue vivo enquanto um deploy roda.
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-80" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (erro || !project) {
    return (
      <Callout
        tone="red"
        title="Projeto não encontrado"
        action={
          <Button variant="secondary" size="xs" asChild>
            <Link to="/">Voltar</Link>
          </Button>
        }
      >
        {erro}
      </Callout>
    );
  }

  const services = project.apps ?? project.services ?? [];
  const status = aggregateStatus(services.map((s: any) => toStatus(s.status)));
  const rodando = services.filter((s: any) => toStatus(s.status) === 'running').length;
  const parados = services.length - rodando;
  const base = `/projects/${id}`;

  return (
    <ProjectProvider value={{ project, reload: load }}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <div className="flex items-start gap-4 max-md:flex-col max-md:gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">{project.name}</h1>
              <Tag>monorepo</Tag>
              <span className="flex items-center gap-1.5">
                <StatusDot status={status} />
                <span className="font-mono tabular-nums text-xs text-text-2">
                  {rodando}/{services.length} running
                </span>
              </span>
              {parados > 0 && <Badge tone={status === 'errored' ? 'red' : 'amber'}>{parados} fora do ar</Badge>}
            </div>

            <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:flex-wrap">
              <Button
                variant="secondary"
                size={viewport === 'desktop' ? 'default' : 'touch'}
                aria-busy={sslLoading ? 'true' : undefined}
                onClick={async () => {
                  setSslLoading(true);
                  try {
                    const res = await api.generateProjectSsl(id);
                    const resultados = res.results || [];
                    const falhas = resultados.filter((r: any) => !r.ok);
                    if (resultados.length === 0) toast.info(res.message || 'Nenhum domínio configurado');
                    else if (falhas.length === 0) toast.success(`SSL gerado para ${resultados.length} domínios`);
                    else
                      toast.error(
                        `${resultados.length - falhas.length}/${resultados.length} OK · falhou: ${falhas.map((r: any) => r.domain).join(', ')}`,
                      );
                    await load();
                  } catch (e: any) {
                    toast.error(e?.message || 'Não foi possível gerar SSL');
                  } finally {
                    setSslLoading(false);
                  }
                }}
              >
                <ShieldCheck aria-hidden />
                Gerar SSL
              </Button>
              <Button
                variant="primary"
                size={viewport === 'desktop' ? 'default' : 'touch'}
                aria-busy={redeploying ? 'true' : undefined}
                onClick={async () => {
                  if (!window.confirm(`Redeploy de ${project.name} refaz build e restart dos ${services.length} services. Continuar?`))
                    return;
                  setRedeploying(true);
                  try {
                    await api.redeployProject(id);
                    toast.success('Redeploy do projeto iniciado');
                    await load();
                  } catch (e: any) {
                    toast.error(e?.message || 'Não foi possível redeployar');
                  } finally {
                    setRedeploying(false);
                  }
                }}
              >
                <RefreshCw aria-hidden />
                Redeploy projeto
              </Button>
            </div>
          </div>

          <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px] leading-5 text-text-3">
            <span className="font-mono tabular-nums text-xs">{project.repository}</span>
            <span aria-hidden>·</span>
            <span className="font-mono tabular-nums text-xs">{project.branch || 'main'}</span>
            <span aria-hidden>·</span>
            <span>{services.length} services</span>
          </p>
        </header>

        <nav aria-label="Seções do projeto" className="flex h-10 items-stretch gap-5 overflow-x-auto border-b border-line-1 max-xl:h-11">
          {ABAS.map((aba) => (
            <NavLink
              key={aba.to || 'index'}
              to={aba.to ? `${base}/${aba.to}` : base}
              end={aba.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center border-b-2 border-transparent px-0.5 text-[13px] font-medium leading-5 text-text-3 transition-colors hover:text-text-2 max-md:text-[15px]',
                  isActive && 'border-accent text-text-1',
                )
              }
            >
              {aba.label}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </div>
    </ProjectProvider>
  );
}
