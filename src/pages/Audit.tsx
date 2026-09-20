import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DataTable,
  EmptyState,
  PageHeader,
  TH,
  TableHead,
  TableRow,
  TableRowGroup,
} from '@/components/ds';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { actionLabel, isDestructiveAction } from '@/lib/audit-labels';
import { EM_DASH, formatAbsolute, formatRelative } from '@/lib/format';
import { toast } from 'sonner';

/** Grade da tabela de auditoria. Mesma gramática de 44px da Visão geral. */
const GRID =
  'grid-cols-[220px_minmax(0,1fr)_200px_132px_112px] ' +
  'max-xl:grid-cols-[200px_minmax(0,1fr)_132px] ' +
  'max-md:grid-cols-[minmax(0,1fr)_100px]';

/**
 * Trilha de auditoria: quem fez o quê, quando e de onde.
 *
 * Os `SystemLog` que já existiam registram o que o **sistema** fez (deploy concluído,
 * app caiu, release removida) e nunca registraram **quem** pediu. Com um painel de um
 * papel só, em que toda conta é administradora total do servidor e ainda por cima tem
 * shell root, não havia nenhuma forma de responder "quem excluiu esse app?".
 *
 * A trilha guarda só metadados: valores de variáveis de ambiente, tokens e webhooks
 * nunca entram — só os NOMES das chaves alteradas.
 */

export default function Audit() {
  const [entries, setEntries] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actions, setActions] = useState<string[]>([]);
  const [filtroAcao, setFiltroAcao] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');

  const load = useCallback(
    async (reset = true) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const data = await api.getAuditLog({
          limit: 50,
          cursor: reset ? undefined : (cursor ?? undefined),
          action: filtroAcao || undefined,
          userEmail: filtroUsuario || undefined,
        });
        setEntries((prev) => (reset ? data.entries : [...prev, ...data.entries]));
        setCursor(data.nextCursor);
      } catch (error: any) {
        toast.error(error.message || 'Erro ao carregar a auditoria');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // `cursor` de propósito fora: a paginação usa o valor no momento do clique.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtroAcao, filtroUsuario],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    api.getAuditActions().then(setActions).catch(() => setActions([]));
  }, []);

  const temFiltro = filtroAcao !== '' || filtroUsuario !== '';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Auditoria"
        meta={
          <>
            <span>Quem fez o quê, quando e de onde</span>
            <span aria-hidden>·</span>
            <span>
              valores de variáveis, tokens e webhooks nunca são registrados — só os nomes das chaves
            </span>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filtroAcao}
          onChange={(e) => setFiltroAcao(e.target.value)}
          aria-label="Filtrar por ação"
          className="flex h-8 min-w-56 items-center rounded-[6px] border border-line-2 bg-bg-1 px-2.5 text-[13px] text-text-1 max-xl:h-12 max-xl:text-[16px]"
        >
          <option value="">Todas as ações</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {actionLabel(action)}
            </option>
          ))}
        </select>

        <div className="relative min-w-52 max-w-80 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-3" aria-hidden />
          <Input
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            placeholder="Filtrar por e-mail"
            aria-label="Filtrar por e-mail do usuário"
            className="pl-8"
          />
        </div>

        {temFiltro && (
          <Button
            variant="ghost"
            onClick={() => {
              setFiltroAcao('');
              setFiltroUsuario('');
            }}
          >
            <X aria-hidden />
            Limpar
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-px">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-none" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title={temFiltro ? 'Nenhum registro com esses filtros' : 'Nenhuma ação registrada ainda'}
          description={
            temFiltro
              ? 'Ajuste a ação ou o e-mail.'
              : 'Toda ação feita pelo painel passa a aparecer aqui.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="-mx-8 max-xl:-mx-4 max-md:-mx-4">
            <DataTable label="Trilha de auditoria">
              <TableHead grid={GRID}>
                <span role="columnheader" className={TH}>Ação</span>
                <span role="columnheader" className={TH}>Alvo</span>
                <span role="columnheader" className={cn(TH, 'max-xl:hidden')}>Quem</span>
                <span role="columnheader" className={cn(TH, 'max-xl:hidden')}>Origem</span>
                <span role="columnheader" className={cn(TH, 'text-right')}>Quando</span>
              </TableHead>
              <TableRowGroup>
                {entries.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </TableRowGroup>
            </DataTable>
          </div>

          {cursor && (
            <div className="flex justify-center">
              <Button variant="secondary" disabled={loadingMore} onClick={() => load(false)}>
                {loadingMore ? <Loader2 className="animate-spin" aria-hidden /> : <ChevronDown aria-hidden />}
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Uma entrada da trilha.
 *
 * Ação destrutiva recebe âmbar **na palavra**, não uma borda lateral colorida — e uma
 * falha recebe ícone além da cor. Os metadados só carregam nomes de chave: o valor de
 * uma variável de ambiente nunca chega aqui.
 */
function AuditRow({ entry }: { entry: any }) {
  const destrutiva = isDestructiveAction(entry.action);
  const envKeys = Array.isArray(entry.metadata?.envKeys) ? (entry.metadata.envKeys as string[]) : null;
  const extras = entry.metadata
    ? Object.entries(entry.metadata)
        .filter(([key]) => key !== 'envKeys')
        .map(([key, value]) => `${key}=${String(value)}`)
    : [];

  return (
    <TableRow grid={GRID} className="items-start py-2 max-md:h-auto">
      <span role="cell" className="flex min-w-0 items-center gap-1.5 pt-0.5">
        {!entry.success && <AlertTriangle className="size-3.5 shrink-0 text-red" aria-hidden />}
        <span
          className={cn(
            'truncate text-[13px] font-medium leading-5',
            !entry.success ? 'text-red' : destrutiva ? 'text-amber' : 'text-text-1',
          )}
          title={actionLabel(entry.action)}
        >
          {actionLabel(entry.action)}
        </span>
        {!entry.success && <span className="shrink-0 text-2xs text-red">falhou</span>}
      </span>

      <div role="cell" className="flex min-w-0 flex-col justify-center gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          {entry.targetType === 'app' && entry.targetName ? (
            <Link
              to={`/apps/${encodeURIComponent(entry.targetName)}`}
              className="truncate font-mono tabular-nums text-xs text-text-1 transition-colors hover:text-accent"
            >
              {entry.targetName}
            </Link>
          ) : (
            <span className="truncate font-mono tabular-nums text-xs text-text-2">
              {entry.targetName || EM_DASH}
            </span>
          )}
        </span>
        {envKeys && envKeys.length > 0 && (
          <span className="truncate font-mono tabular-nums text-2xs leading-4 text-text-3" title={envKeys.join(', ')}>
            chaves: {envKeys.join(', ')}
          </span>
        )}
        {extras.length > 0 && (
          <span className="truncate font-mono tabular-nums text-2xs leading-4 text-text-3" title={extras.join(' · ')}>
            {extras.join(' · ')}
          </span>
        )}
      </div>

      <span role="cell" className="truncate text-xs leading-[18px] text-text-2 max-xl:hidden" title={entry.userEmail}>
        {entry.userEmail ?? 'anônimo'}
      </span>

      <span role="cell" className="truncate font-mono tabular-nums text-xs leading-[18px] text-text-3 max-xl:hidden">
        {entry.ip || EM_DASH}
      </span>

      <span role="cell" className="pt-0.5 text-right font-mono tabular-nums text-xs leading-[18px] text-text-2">
        <time dateTime={entry.createdAt} title={formatAbsolute(entry.createdAt)}>
          {formatRelative(entry.createdAt, { units: 1 })}
        </time>
      </span>
    </TableRow>
  );
}
