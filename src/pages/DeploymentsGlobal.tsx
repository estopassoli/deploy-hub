import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Search } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { EM_DASH, formatAbsolute, formatElapsed, formatRelative } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout, DataTable, EmptyState, PageHeader, TH, TableHead, TableRow, TableRowGroup } from '@/components/ds';

/**
 * Histórico de deploys do servidor inteiro.
 *
 * `GET /deploy/history` e `GET /deploy/running` já existiam na API e **nenhuma tela os
 * usava** — o painel tinha 215 deploys registrados e nenhum lugar para vê-los juntos.
 *
 * Sem `<select>` de app: o filtro é chip e busca, e cada linha leva ao log daquele
 * deploy na página do app. Um seletor de contexto paralelo à URL é a origem de toda
 * uma classe de bug de deep-link.
 */
const GRID =
  'grid-cols-[96px_150px_minmax(0,1fr)_132px_112px_88px_60px] ' +
  'max-xl:grid-cols-[96px_150px_minmax(0,1fr)_112px_60px] ' +
  'max-md:grid-cols-[minmax(0,1fr)_100px]';

type Filtro = 'todos' | 'success' | 'failed';

export default function DeploymentsGlobal() {
  const [deploys, setDeploys] = useState<any[] | null>(null);
  const [emAndamento, setEmAndamento] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    try {
      const [historico, rodando] = await Promise.all([
        api.getDeployHistory(),
        api.getRunningDeploys().catch(() => []),
      ]);
      setDeploys(historico ?? []);
      setEmAndamento(rodando ?? []);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar o histórico');
      setDeploys([]);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15_000);
    return () => clearInterval(t);
  }, [carregar]);

  const contagens = useMemo(() => {
    const lista = deploys ?? [];
    return {
      todos: lista.length,
      success: lista.filter((d) => d.status === 'success').length,
      failed: lista.filter((d) => d.status === 'failed').length,
    };
  }, [deploys]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (deploys ?? [])
      .filter((d) => filtro === 'todos' || d.status === filtro)
      .filter(
        (d) =>
          !termo ||
          (d.app?.name ?? d.project?.name ?? '').toLowerCase().includes(termo) ||
          (d.commitMessage ?? '').toLowerCase().includes(termo) ||
          (d.version ?? '').toLowerCase().includes(termo),
      );
  }, [deploys, filtro, busca]);

  if (deploys === null) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <div className="flex flex-col gap-px">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-none" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Deployments"
        meta={
          <>
            <span>{contagens.todos} no histórico</span>
            <span aria-hidden>·</span>
            <span>{contagens.failed} falharam</span>
            {emAndamento.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-amber">{emAndamento.length} em andamento</span>
              </>
            )}
          </>
        }
      />

      {erro && <Callout tone="red" title="Não foi possível carregar o histórico">{erro}</Callout>}

      {emAndamento.length > 0 && (
        <Callout tone="amber" title={`${emAndamento.length} deploy(s) em andamento`}>
          {emAndamento.map((d) => d.key).join(', ')}
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filtrar por resultado" className="flex items-center gap-1 rounded-md border border-line-2 bg-bg-1 p-0.5">
          {(
            [
              ['todos', 'Todos'],
              ['success', 'Ready'],
              ['failed', 'Failed'],
            ] as [Filtro, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filtro === id}
              onClick={() => setFiltro(id)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-[4px] px-2.5 text-xs font-medium transition-colors max-xl:h-10',
                filtro === id ? 'bg-bg-3 text-text-1' : 'text-text-2 hover:text-text-1',
              )}
            >
              {label}
              <span className="font-mono tabular-nums text-2xs text-text-3">{contagens[id]}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-52 max-w-80 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-3" aria-hidden />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar app, commit ou release"
            aria-label="Buscar deploys"
            className="pl-8"
          />
        </div>
      </div>

      {visiveis.length === 0 ? (
        <EmptyState title="Nenhum deploy" description="Ajuste o filtro ou faça o primeiro deploy." />
      ) : (
        <div className="-mx-8 max-xl:-mx-4 max-md:-mx-4">
          <DataTable label="Histórico de deploys">
            <TableHead grid={GRID}>
              <span role="columnheader" className={TH}>Status</span>
              <span role="columnheader" className={TH}>App</span>
              <span role="columnheader" className={TH}>Commit</span>
              <span role="columnheader" className={cn(TH, 'max-xl:hidden')}>Release</span>
              <span role="columnheader" className={TH}>Quando</span>
              <span role="columnheader" className={cn(TH, 'text-right max-xl:hidden')}>Duração</span>
              <span role="columnheader" className={cn(TH, 'text-right')}>Log</span>
            </TableHead>
            <TableRowGroup>
              {visiveis.map((d) => {
                const alvo = d.app?.name ?? d.project?.name ?? EM_DASH;
                const sucesso = d.status === 'success';
                return (
                  <TableRow key={d.id} grid={GRID}>
                    <span role="cell">
                      <Badge tone={sucesso ? 'accent' : d.status === 'failed' ? 'red' : 'amber'}>
                        {sucesso ? 'Ready' : d.status === 'failed' ? 'Failed' : d.status}
                      </Badge>
                    </span>
                    <div role="cell" className="min-w-0">
                      {d.app?.name ? (
                        <Link
                          to={`/apps/${encodeURIComponent(d.app.name)}/deployments`}
                          className="truncate text-[13px] font-medium text-text-1"
                        >
                          {alvo}
                        </Link>
                      ) : d.project?.id ? (
                        <Link
                          to={`/projects/${d.project.id}/deployments`}
                          className="truncate text-[13px] font-medium text-text-1"
                        >
                          {alvo}
                        </Link>
                      ) : (
                        <span className="truncate text-[13px] text-text-2">{alvo}</span>
                      )}
                    </div>
                    <span
                      role="cell"
                      title={d.commitMessage}
                      className="truncate text-[13px] leading-5 text-text-2 max-md:hidden"
                    >
                      {d.commitMessage || EM_DASH}
                    </span>
                    <span role="cell" className="truncate font-mono tabular-nums text-xs text-text-2 max-xl:hidden">
                      {d.version || EM_DASH}
                    </span>
                    <span role="cell" className="font-mono tabular-nums text-xs text-text-2 max-md:hidden">
                      <time dateTime={d.createdAt} title={formatAbsolute(d.createdAt)}>
                        {formatRelative(d.createdAt, { units: 1 })}
                      </time>
                    </span>
                    <span role="cell" className="text-right font-mono tabular-nums text-xs text-text-2 max-xl:hidden">
                      {formatElapsed(d.startedAt ?? d.createdAt, d.finishedAt) || EM_DASH}
                    </span>
                    <span role="cell" className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Log do deploy ${d.version ?? ''} de ${alvo}`}
                        onClick={async () => {
                          try {
                            const data = await api.getDeployLogs(d.id);
                            toast.message(`Log de ${d.version ?? alvo}`, {
                              description: (data.logs || '').split('\n').slice(-12).join('\n'),
                              duration: 15000,
                            });
                          } catch (e: any) {
                            toast.error(e?.message || 'Erro ao carregar o log');
                          }
                        }}
                      >
                        <FileText aria-hidden />
                      </Button>
                    </span>
                  </TableRow>
                );
              })}
            </TableRowGroup>
          </DataTable>
        </div>
      )}
    </div>
  );
}
