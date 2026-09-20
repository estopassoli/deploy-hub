import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, Loader2, RotateCcw, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { EM_DASH } from '@/lib/format';
import { toStatus } from '@/lib/app-status';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout, Kbd, StatusLabel, Tag } from '@/components/ds';
import { AppRowActions } from '@/components/apps/AppRowActions';
import { DeployLogSheet } from '@/components/apps/DeployLogSheet';
import { useViewport } from '@/hooks/useViewport';
import { useKeyboardMap } from '@/hooks/useKeyboardMap';
import { AppProvider } from './AppContext';

/**
 * Página de um app — **layout route**: cabeçalho, tira de abas e `<Outlet/>`.
 *
 * ## Cada aba é um segmento de URL, não `useState`
 *
 * A versão anterior guardava a aba ativa em `defaultValue="overview"`, em memória. O
 * custo disso não é estético: não havia deep-link, o botão voltar do navegador saía do
 * app, e não existia `/apps/:name/deployments` para uma notificação apontar. A paleta
 * ⌘K também precisa de um destino por aba.
 *
 * ## A rota é por **nome**, não por id
 *
 * O nome é único no servidor, é o que o operador digita, é o que aparece no breadcrumb
 * e é o que o ⌘K casa. Como a API resolve por id, a resolução nome→id acontece aqui,
 * uma vez — e um `/apps/<id>` antigo continua funcionando.
 */
const ABAS = [
  { to: '', label: 'Visão geral', end: true },
  { to: 'deployments', label: 'Deployments' },
  { to: 'logs', label: 'Logs' },
  { to: 'env', label: 'Ambiente e build' },
  { to: 'git', label: 'Git e CI' },
  { to: 'settings', label: 'Configurações' },
];

export default function AppPage() {
  const { name = '' } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const viewport = useViewport();

  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const lista = await api.getApps();
      const alvo =
        lista.find((a: any) => a.name === decodeURIComponent(name)) ?? lista.find((a: any) => a.id === name);

      if (!alvo) {
        setErro(`Nenhum app chamado ${decodeURIComponent(name)} neste servidor.`);
        setLoading(false);
        return;
      }

      // Chegou por id: troca a URL pelo nome sem empilhar histórico.
      if (alvo.id === name && alvo.name !== name) {
        navigate(`/apps/${encodeURIComponent(alvo.name)}`, { replace: true });
        return;
      }

      setApp(await api.getApp(alvo.id));
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar o app');
    } finally {
      setLoading(false);
    }
  }, [name, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // Status e uptime seguem vivos enquanto a página está aberta.
  useEffect(() => {
    if (!app?.id) return;
    const t = setInterval(async () => {
      try {
        setApp(await api.getApp(app.id));
      } catch {
        /* falha de polling não derruba a tela; o dado anterior continua visível */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [app?.id]);

  const status = toStatus(app?.status);
  const deployKey = useMemo(() => app?.project?.name || app?.name || '', [app]);
  const base = `/apps/${encodeURIComponent(app?.name ?? name)}`;

  useKeyboardMap({
    enabled: viewport === 'desktop' && Boolean(app),
    bindings: useMemo(
      () => ({
        l: () => navigate(`${base}/logs`),
        d: () => navigate(`${base}/deployments`),
        e: () => navigate(`${base}/env`),
        c: () => navigate(`${base}/settings`),
        o: () => app?.domain && window.open(`https://${app.domain}`, '_blank', 'noopener'),
        r: async () => {
          setSheetOpen(true);
          await api.redeploy(app.id).catch((e: any) => toast.error(e?.message || 'Erro ao redeployar'));
        },
      }),
      [base, navigate, app],
    ),
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (erro || !app) {
    return (
      <Callout
        tone="red"
        title="App não encontrado"
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

  return (
    <AppProvider value={{ app, reload: load, deployKey, openDeploySheet: () => setSheetOpen(true) }}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <div className="flex items-start gap-4 max-md:flex-col max-md:gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">{app.name}</h1>
              {app.type && <Tag>{app.type}</Tag>}
              {app.activeRuntime && (
                <Tag tone={app.activeRuntime === 'docker' ? 'docker' : 'neutral'}>{app.activeRuntime}</Tag>
              )}
              <span className="font-mono tabular-nums text-xs text-text-3">:{app.port}</span>
              <StatusLabel status={status} />
            </div>

            <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:flex-wrap">
              {app.domain && (
                <Button variant="secondary" size={viewport === 'desktop' ? 'default' : 'touch'} withKbd={viewport === 'desktop'} asChild>
                  <a href={`https://${app.domain}`} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden />
                    Abrir
                    {viewport === 'desktop' && <Kbd>O</Kbd>}
                  </a>
                </Button>
              )}
              <Button variant="secondary" size={viewport === 'desktop' ? 'default' : 'touch'} withKbd={viewport === 'desktop'} asChild>
                <Link to={`${base}/logs`}>
                  <ScrollText aria-hidden />
                  Logs
                  {viewport === 'desktop' && <Kbd>L</Kbd>}
                </Link>
              </Button>
              <Button
                variant="primary"
                size={viewport === 'desktop' ? 'default' : 'touch'}
                withKbd={viewport === 'desktop'}
                onClick={async () => {
                  setSheetOpen(true);
                  try {
                    await api.redeploy(app.id);
                  } catch (e: any) {
                    toast.error(e?.message || 'Erro ao redeployar');
                  }
                }}
              >
                <RotateCcw aria-hidden />
                Redeploy
                {viewport === 'desktop' && <Kbd tone="on-primary">R</Kbd>}
              </Button>
              <AppRowActions
                app={{
                  id: app.id,
                  name: app.name,
                  status,
                  domain: app.domain ?? null,
                  port: app.port,
                  cpu: app.cpu,
                  memory: app.memory,
                  uptime: app.uptime,
                  branch: app.branch,
                }}
                onLifecycle={async (acao) => {
                  try {
                    if (acao === 'redeploy') {
                      setSheetOpen(true);
                      await api.redeploy(app.id);
                    } else if (acao === 'start') await api.startApp(app.id);
                    else if (acao === 'stop') await api.stopApp(app.id);
                    else await api.restartApp(app.id);
                    await load();
                  } catch (e: any) {
                    toast.error(e?.message || 'Não foi possível executar a ação');
                  }
                }}
                onDelete={() => navigate(`${base}/settings#excluir`)}
              />
            </div>
          </div>

          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-text-3">
            {app.domain ? (
              <a
                href={`https://${app.domain}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono tabular-nums text-xs text-text-2 transition-colors hover:text-text-1"
              >
                {app.domain}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              <span className="font-mono text-xs">{EM_DASH} sem domínio</span>
            )}
            {app.project && (
              <>
                <span aria-hidden>·</span>
                <Link to={`/projects/${app.project.id}`} className="text-text-2 transition-colors hover:text-text-1">
                  service de {app.project.name}
                </Link>
              </>
            )}
            {app.uptime && (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono tabular-nums text-xs">no ar há {app.uptime}</span>
              </>
            )}
          </p>
        </header>

        <nav aria-label="Seções do app" className="flex h-10 items-stretch gap-5 overflow-x-auto border-b border-line-1 max-xl:h-11 max-md:gap-4">
          {ABAS.map((aba) => (
            <NavLink
              key={aba.to || 'index'}
              to={aba.to ? `${base}/${aba.to}` : base}
              end={aba.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center border-b-2 border-transparent px-0.5 text-[13px] font-medium leading-5 text-text-3 transition-colors hover:text-text-2',
                  'max-md:text-[15px]',
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

      <DeployLogSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        deployKey={deployKey}
        title={`Deploy de ${app.name}`}
        onFinished={load}
      />
    </AppProvider>
  );
}
