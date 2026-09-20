import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, Play, RefreshCw, RotateCcw, ScrollText, Search, ShieldCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { EM_DASH, formatMB, formatPercent, formatRelative } from '@/lib/format';
import { byProblemFirst, primaryAction } from '@/lib/app-status';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Callout,
  DataTable,
  EmptyState,
  FleetStrip,
  GroupHeader,
  HealthCell,
  HealthStrip,
  Kbd,
  MicroMeter,
  PageHeader,
  StatusDot,
  StatusLabel,
  TH,
  TableFooter,
  TableHead,
  TableRow,
  TableRowGroup,
  aggregateStatus,
} from '@/components/ds';
import { IconButton } from '@/components/ds/icon-button';
import { CRIT_AT, WARN_AT, meterTone } from '@/components/ds/meter';
import { AppRowActions } from '@/components/apps/AppRowActions';
import { useFleetContext } from '@/components/shell/FleetContext';
import { useSystemStats } from '@/hooks/useSystemStats';
import type { FleetApp, FleetGroup } from '@/hooks/useFleet';

/**
 * Visão geral — a tela que define a gramática de tabela reusada por seis outras.
 *
 * ## O que ela substitui
 *
 * 21 apps em cards de 371px, que davam **5.848px de página no desktop e 8.282px no
 * celular** — quase dez telas para ver a frota. Além disso, no celular a página rolava
 * 96px na horizontal e o kebab de cada card ficava fora da tela, levando junto o único
 * caminho para as ações do app.
 *
 * Aqui são linhas de 44px agrupadas por projeto, com a faixa de saúde acima: os 21 apps
 * cabem em cerca de 1.500px e o primeiro aparece na primeira dobra em qualquer
 * viewport.
 *
 * ## Duas regras de conteúdo
 *
 * - **Problemas primeiro.** A contagem do cabeçalho é derivada do status, nunca
 *   persistida — o painel dizia "Problemas 0" com quatro apps fora do ar porque
 *   comparava com a palavra errada.
 * - **Linha parada não mostra medidor.** As três células numéricas viram
 *   "motivo · fonte · quando": um trilho zerado ao lado de um app morto sugere uma
 *   medição que não existe.
 */
const APPS_GRID =
  'grid-cols-[66px_166px_228px_48px_84px_64px_92px] ' +
  'max-xl:grid-cols-[80px_minmax(0,1fr)_72px_84px_96px] ' +
  'max-md:grid-cols-[minmax(0,1fr)_132px_44px]';

const GROUP_GRID =
  'grid-cols-[66px_1fr_188px] max-xl:grid-cols-[80px_1fr_140px] max-md:grid-cols-[minmax(0,1fr)_92px]';

type Filtro = 'todos' | 'running' | 'stopped' | 'errored';

export default function Overview() {
  const fleet = useFleetContext();
  const stats = useSystemStats();
  const navigate = useNavigate();

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);

  const contagens = useMemo(() => {
    const c = { todos: fleet.apps.length, running: 0, stopped: 0, errored: 0 };
    for (const app of fleet.apps) {
      if (app.status === 'running' || app.status === 'ready') c.running++;
      else if (app.status === 'stopped') c.stopped++;
      else if (app.status === 'errored' || app.status === 'failed') c.errored++;
    }
    return c;
  }, [fleet.apps]);

  const problemas = contagens.stopped + contagens.errored;

  const gruposVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return fleet.groups
      .map((grupo) => ({
        ...grupo,
        apps: grupo.apps
          .filter((app) => {
            if (filtro === 'running') return app.status === 'running' || app.status === 'ready';
            if (filtro === 'stopped') return app.status === 'stopped';
            if (filtro === 'errored') return app.status === 'errored' || app.status === 'failed';
            return true;
          })
          .filter(
            (app) =>
              !termo ||
              app.name.toLowerCase().includes(termo) ||
              (app.domain ?? '').toLowerCase().includes(termo) ||
              (app.branch ?? '').toLowerCase().includes(termo),
          )
          .sort(byProblemFirst),
      }))
      .filter((grupo) => grupo.apps.length > 0);
  }, [fleet.groups, filtro, busca]);

  const executar = async (app: FleetApp, acao: 'start' | 'stop' | 'restart' | 'redeploy') => {
    setOcupado(app.id);
    try {
      if (acao === 'redeploy') await api.redeploy(app.id);
      else if (acao === 'start') await api.startApp(app.id);
      else if (acao === 'stop') await api.stopApp(app.id);
      else await api.restartApp(app.id);
      toast.success(`${acao} enviado para ${app.name}`, {
        action: { label: 'Ver logs', onClick: () => navigate(`/apps/${encodeURIComponent(app.name)}/logs`) },
      });
      await fleet.reload();
    } catch (e: any) {
      toast.error(e?.message || `Não foi possível executar ${acao}`);
    } finally {
      setOcupado(null);
    }
  };

  const alternarGrupo = (id: string) =>
    setFechados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  if (fleet.loading) return <OverviewSkeleton />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Visão geral"
        meta={
          <>
            {problemas > 0 ? (
              <span className="flex items-center gap-1.5">
                <StatusDot status={contagens.errored > 0 ? 'errored' : 'stopped'} />
                <span className="font-medium text-text-1">
                  {problemas} {problemas === 1 ? 'app fora do ar' : 'apps fora do ar'}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <StatusDot status="running" />
                <span>tudo no ar</span>
              </span>
            )}
            <span aria-hidden>·</span>
            <span>{fleet.apps.length} apps</span>
            <span aria-hidden>·</span>
            <span>{gruposVisiveis.filter((g) => g.projectId).length} projetos</span>
          </>
        }
      />

      {fleet.error && (
        <Callout
          tone="red"
          title="Não foi possível carregar os apps"
          action={
            <Button variant="secondary" size="xs" onClick={fleet.reload}>
              Tentar de novo
            </Button>
          }
        >
          {fleet.error}
        </Callout>
      )}

      <Saude apps={fleet.apps} groups={fleet.groups} stats={stats} />

      <FilterBar contagens={contagens} filtro={filtro} onFiltro={setFiltro} busca={busca} onBusca={setBusca} />

      {gruposVisiveis.length === 0 ? (
        <EmptyState
          icon={<Search className="h-4 w-4 text-text-3" aria-hidden />}
          title={fleet.apps.length === 0 ? 'Nenhum app ainda' : 'Nada encontrado'}
          description={
            fleet.apps.length === 0
              ? 'Aponte um repositório e o painel cuida de clone, build, processo e Nginx.'
              : 'Ajuste a busca ou o filtro de status.'
          }
          action={
            fleet.apps.length === 0 ? (
              <Button variant="secondary" asChild>
                <Link to="/new">
                  <Plus aria-hidden />
                  Novo deploy
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="-mx-8 max-xl:-mx-4 max-md:-mx-4">
          <DataTable label="Apps por projeto">
            <TableHead grid={APPS_GRID}>
              <span role="columnheader" aria-sort="descending" className={TH}>
                Status
              </span>
              <span role="columnheader" className={TH}>
                App
              </span>
              <span role="columnheader" className={cn(TH, 'max-xl:hidden')}>
                Domínio
              </span>
              <span role="columnheader" className={cn(TH, 'text-right')}>
                CPU
              </span>
              <span role="columnheader" className={cn(TH, 'text-right')}>
                Mem
              </span>
              <span role="columnheader" className={cn(TH, 'text-right max-xl:hidden')}>
                Uptime
              </span>
              <span role="columnheader" className={cn(TH, 'text-right')}>
                Ações
              </span>
            </TableHead>

            {gruposVisiveis.map((grupo) => (
              <Grupo
                key={grupo.id}
                grupo={grupo}
                aberto={!fechados.has(grupo.id)}
                onToggle={() => alternarGrupo(grupo.id)}
                onLifecycle={executar}
                ocupado={ocupado}
                onReload={fleet.reload}
              />
            ))}

            <TableFooter>
              <span className="font-mono tabular-nums text-2xs text-text-3">
                {fleet.apps.length} apps · {contagens.running} running · {contagens.stopped} stopped ·{' '}
                {contagens.errored} errored
              </span>
              <span className="flex-1" />
              <span className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <Kbd>/</Kbd>
                  <span className="text-xs text-text-3">filtrar</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd>.</Kbd>
                  <span className="text-xs text-text-3">ações</span>
                </span>
              </span>
            </TableFooter>
          </DataTable>
        </div>
      )}
    </div>
  );
}

function Saude({
  apps,
  groups,
  stats,
}: {
  apps: FleetApp[];
  groups: FleetGroup[];
  stats: ReturnType<typeof useSystemStats>;
}) {
  const rodando = apps.filter((a) => a.status === 'running' || a.status === 'ready').length;
  const parados = apps.filter((a) => a.status === 'stopped').length;
  const quebrados = apps.filter((a) => a.status === 'errored' || a.status === 'failed').length;

  return (
    <HealthStrip>
      {/*
        O rótulo vem do `HealthCell`, então o `Meter` entra sem rótulo próprio — mas
        com o número visível. A versão anterior escondia a primeira linha do medidor
        com `[&>div:first-child]:hidden` para sumir com o rótulo duplicado, e levava
        junto o valor: a faixa mostrava três barras sem nenhuma porcentagem.
      */}
      <HealthCell label="CPU" hint={stats.stale ? 'sem atualizar · tentando' : 'sem histórico'}>
        <MedidorSimples value={stats.data?.cpuUsage} />
      </HealthCell>
      <HealthCell label="Memória" hint={stats.stale ? 'sem atualizar · tentando' : undefined}>
        <MedidorSimples value={stats.data?.memoryUsage} />
      </HealthCell>
      <HealthCell label="Disco" hint={stats.stale ? 'sem atualizar · tentando' : undefined}>
        <MedidorSimples value={stats.data?.diskUsage} />
      </HealthCell>
      <HealthCell
        label="Apps"
        hint={[parados > 0 && `${parados} stopped`, quebrados > 0 && `${quebrados} errored`]
          .filter(Boolean)
          .join(' · ')}
      >
        <span className="flex flex-col gap-1.5">
          <span className="font-mono tabular-nums text-sm leading-5 text-text-1">
            {rodando}/{apps.length} <span className="text-text-3">running</span>
          </span>
          <FleetStrip groups={groups.map((g) => g.apps.map((a) => a.status))} />
        </span>
      </HealthCell>
      <HealthCell label="Deploys" hint={stats.data ? undefined : 'sem dados'}>
        <span className="font-mono tabular-nums text-sm leading-5 text-text-1">
          {stats.data ? stats.data.totalDeploys : EM_DASH}
        </span>
      </HealthCell>
    </HealthStrip>
  );
}

/**
 * Número + barra, sem rótulo (quem rotula é a célula).
 *
 * Ausência é travessão e **sem barra**: um trilho vazio ao lado de um travessão sugere
 * uma medição de zero, que é diferente de não ter medição.
 */
function MedidorSimples({ value }: { value?: number }) {
  const tem = typeof value === 'number' && Number.isFinite(value);
  if (!tem) return <span className="font-mono tabular-nums text-sm text-text-3">{EM_DASH}</span>;

  const alto = value >= WARN_AT;
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-1.5">
        <span className="font-mono tabular-nums text-sm leading-5 text-text-1">{formatPercent(value, 0)}</span>
        {alto && (
          <span className={cn('text-xs font-medium', value >= CRIT_AT ? 'text-red' : 'text-amber')}>alto</span>
        )}
      </span>
      <span
        role="img"
        aria-label={`${formatPercent(value, 0)}${alto ? ', alto' : ''} — alerta em ${WARN_AT}%, crítico em ${CRIT_AT}%`}
        className="relative block h-1 overflow-hidden rounded-full bg-bg-3"
      >
        <span className={cn('block h-1 rounded-full', meterTone(value))} style={{ width: `${Math.min(100, value)}%` }} />
        <span aria-hidden className="absolute inset-y-0 left-[70%] w-px bg-line-3" />
        <span aria-hidden className="absolute inset-y-0 left-[90%] w-px bg-line-3" />
      </span>
    </span>
  );
}

function FilterBar({
  contagens,
  filtro,
  onFiltro,
  busca,
  onBusca,
}: {
  contagens: Record<Filtro, number>;
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  busca: string;
  onBusca: (v: string) => void;
}) {
  const opcoes: { id: Filtro; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'running', label: 'Running' },
    { id: 'stopped', label: 'Stopped' },
    { id: 'errored', label: 'Errored' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Filtrar por status" className="flex items-center gap-1 rounded-md border border-line-2 bg-bg-1 p-0.5">
        {opcoes.map((op) => (
          <button
            key={op.id}
            type="button"
            aria-pressed={filtro === op.id}
            onClick={() => onFiltro(op.id)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-[4px] px-2.5 text-xs font-medium transition-colors max-xl:h-10',
              filtro === op.id ? 'bg-bg-3 text-text-1' : 'text-text-2 hover:text-text-1',
            )}
          >
            {op.label}
            <span className="font-mono tabular-nums text-2xs text-text-3">{contagens[op.id]}</span>
          </button>
        ))}
      </div>

      <div className="relative min-w-52 flex-1 max-w-80">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-3" aria-hidden />
        <Input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar app, domínio ou branch"
          aria-label="Buscar apps"
          className="pl-8"
        />
      </div>
    </div>
  );
}

function Grupo({
  grupo,
  aberto,
  onToggle,
  onLifecycle,
  ocupado,
  onReload,
}: {
  grupo: FleetGroup;
  aberto: boolean;
  onToggle: () => void;
  onLifecycle: (app: FleetApp, acao: 'start' | 'stop' | 'restart' | 'redeploy') => void;
  ocupado: string | null;
  onReload: () => Promise<void>;
}) {
  const rodando = grupo.apps.filter((a) => a.status === 'running' || a.status === 'ready').length;
  const parados = grupo.apps.filter((a) => a.status === 'stopped').length;
  const quebrados = grupo.apps.filter((a) => a.status === 'errored' || a.status === 'failed').length;
  const rowgroupId = `g-${grupo.id}`;

  return (
    <>
      <GroupHeader
        grid={GROUP_GRID}
        name={grupo.name}
        status={aggregateStatus(grupo.apps.map((a) => a.status))}
        fraction={`${rodando}/${grupo.apps.length} running`}
        badge={
          quebrados > 0 ? (
            <Badge tone="red">{quebrados} errored</Badge>
          ) : parados > 0 ? (
            <Badge tone="amber">{parados} stopped</Badge>
          ) : undefined
        }
        meta={grupo.projectId ? grupo.apps[0]?.branch || undefined : undefined}
        open={aberto}
        onToggle={onToggle}
        controls={rowgroupId}
        actions={
          grupo.projectId ? (
            <>
              {parados > 0 && (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => grupo.apps.filter((a) => a.status === 'stopped').forEach((a) => onLifecycle(a, 'start'))}
                >
                  <Play aria-hidden />
                  Start {parados}
                </Button>
              )}
              <Button variant="ghost" size="icon-xs" aria-label={`Abrir o projeto ${grupo.name}`} asChild>
                <Link to={`/projects/${grupo.projectId}`}>
                  <ShieldCheck aria-hidden />
                </Link>
              </Button>
              <IconButton
                label={`Redeploy do projeto ${grupo.name}`}
                icon={<RefreshCw aria-hidden />}
                onClick={async () => {
                  try {
                    await api.redeployProject(grupo.projectId!);
                    toast.success(`Redeploy do projeto ${grupo.name} iniciado`);
                    await onReload();
                  } catch (e: any) {
                    toast.error(e?.message || 'Não foi possível redeployar');
                  }
                }}
              />
            </>
          ) : undefined
        }
      />

      {aberto && (
        <TableRowGroup id={rowgroupId}>
          {grupo.apps.map((app) => (
            <Linha key={app.id} app={app} onLifecycle={onLifecycle} busy={ocupado === app.id} onReload={onReload} />
          ))}
        </TableRowGroup>
      )}
    </>
  );
}

function Linha({
  app,
  onLifecycle,
  busy,
  onReload,
}: {
  app: FleetApp;
  onLifecycle: (app: FleetApp, acao: 'start' | 'stop' | 'restart' | 'redeploy') => void;
  busy: boolean;
  onReload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const rota = `/apps/${encodeURIComponent(app.name)}`;
  const vivo = app.status === 'running' || app.status === 'ready';
  const acao = primaryAction(app.status);

  return (
    <TableRow grid={APPS_GRID}>
      <span role="cell" className="max-md:hidden">
        <StatusLabel status={app.status} />
      </span>

      <div role="cell" className="min-w-0">
        <Link
          to={rota}
          className="flex h-6 items-center gap-2 whitespace-nowrap text-[13px] leading-5 max-md:h-auto max-md:flex-col max-md:items-start max-md:gap-0.5"
        >
          <span className="font-medium text-text-1 max-md:text-[15px]">{app.name}</span>
          <span className="hidden items-center gap-1.5 max-md:flex">
            <StatusDot status={app.status} size={6} />
            <span className="font-mono tabular-nums text-[13px] text-text-3">
              {app.domain || EM_DASH} :{app.port}
            </span>
          </span>
          {/* Tablet: o domínio dobra na segunda linha da célula do nome. */}
          <span className="hidden font-mono tabular-nums text-2xs text-text-3 max-xl:block max-md:hidden">
            {app.domain || EM_DASH} :{app.port}
          </span>
        </Link>
      </div>

      <div role="cell" className="min-w-0 max-xl:hidden">
        {app.domain ? (
          <a
            href={`https://${app.domain}`}
            target="_blank"
            rel="noreferrer"
            title={`Abrir https://${app.domain}`}
            className="flex h-6 min-w-0 items-center gap-1 text-text-2 transition-colors hover:text-text-1"
          >
            <span className="whitespace-nowrap font-mono tabular-nums text-xs leading-[18px]">{app.domain}</span>
            <span className="whitespace-nowrap font-mono tabular-nums text-2xs leading-[18px] text-text-3">
              :{app.port}
            </span>
            <ExternalLink className="size-3 text-text-3" aria-hidden />
          </a>
        ) : (
          <span className="font-mono tabular-nums text-xs text-text-3">{EM_DASH}</span>
        )}
      </div>

      {vivo ? (
        <>
          <span
            role="cell"
            className="text-right font-mono tabular-nums text-xs leading-[18px] text-text-2 max-md:hidden"
          >
            {formatPercent(app.cpu)}
          </span>
          <span role="cell" className="max-md:hidden">
            {app.memory != null ? (
              <MicroMeter value={formatMB(app.memory).split(' ')[0]} unit={formatMB(app.memory).split(' ')[1]} percent={Math.min(100, (app.memory / 1024) * 100)} />
            ) : (
              <span className="block text-right font-mono tabular-nums text-xs text-text-3">{EM_DASH}</span>
            )}
          </span>
          <span
            role="cell"
            className="text-right font-mono tabular-nums text-xs leading-[18px] text-text-2 max-xl:hidden"
          >
            {app.uptime || EM_DASH}
          </span>
        </>
      ) : (
        /* Linha parada: as células numéricas explicam o motivo em vez de mostrar zeros. */
        <span
          role="cell"
          title={`Processo em estado ${app.status}`}
          className="col-start-4 col-span-3 flex min-w-0 flex-col justify-center max-xl:col-start-3 max-xl:col-span-2 max-md:hidden"
        >
          <span className="truncate text-xs leading-4 text-text-2">Processo em estado {app.status}</span>
          <span className="truncate font-mono tabular-nums text-2xs leading-4 text-text-3">
            {app.activeRuntime || 'pm2'}
          </span>
        </span>
      )}

      {/* Celular: status e uptime numa coluna só. */}
      <span role="cell" className="hidden flex-col items-end gap-0.5 max-md:flex">
        <StatusLabel status={app.status} />
        <span className="font-mono tabular-nums text-[13px] text-text-3">
          {vivo ? `${formatPercent(app.cpu)} · ${formatMB(app.memory)}` : formatRelative(null)}
        </span>
      </span>

      <span role="cell" className="flex items-center justify-end gap-1">
        <IconButton
          label={`Logs de ${app.name}`}
          shortcut="L"
          icon={<ScrollText aria-hidden />}
          onClick={() => navigate(`${rota}/logs`)}
          className="max-xl:hidden"
        />
        <IconButton
          label={`${acao} de ${app.name}`}
          shortcut={acao === 'Redeploy' ? 'R' : acao === 'Start' ? 'S' : '⇧R'}
          icon={
            acao === 'Redeploy' ? <RefreshCw aria-hidden /> : acao === 'Start' ? <Play aria-hidden /> : <RotateCcw aria-hidden />
          }
          aria-busy={busy ? 'true' : undefined}
          onClick={() => onLifecycle(app, acao === 'Redeploy' ? 'redeploy' : acao === 'Start' ? 'start' : 'restart')}
          className="max-xl:hidden"
        />
        <AppRowActions
          app={app}
          busy={busy}
          onLifecycle={(a) => onLifecycle(app, a)}
          onDelete={async () => {
            if (!window.confirm(`Excluir ${app.name}? Processo, vhost e arquivos são removidos.`)) return;
            try {
              await api.deleteApp(app.id);
              toast.success(`${app.name} removido`);
              await onReload();
            } catch (e: any) {
              toast.error(e?.message || 'Não foi possível remover');
            }
          }}
        />
      </span>
    </TableRow>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-5 w-80" />
      </div>
      <Skeleton className="h-17 w-full" />
      <Skeleton className="h-8 w-96" />
      <div className="flex flex-col gap-px">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}
