import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Loader2, Search, ShieldCheck, User, X } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogLinesSkeleton } from '@/components/Skeletons';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { actionLabel, isDestructiveAction } from '@/lib/audit-labels';
import { formatDateTime } from '@/lib/format';
import { toast } from 'sonner';

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
    <Layout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground md:text-3xl">
            <ShieldCheck className="h-7 w-7 text-primary" />
            Auditoria
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quem fez o quê, quando e de onde. Valores de variáveis, tokens e webhooks nunca são
            registrados — apenas os nomes das chaves alteradas.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-64"
          >
            <option value="">Todas as ações</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
          </select>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              placeholder="Filtrar por email do usuário..."
              className="pl-9"
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
              <X className="h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card">
            <LogLinesSkeleton lines={10} />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {temFiltro ? 'Nenhum registro com esses filtros.' : 'Nenhuma ação registrada ainda.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}

            {cursor && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" disabled={loadingMore} onClick={() => load(false)}>
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                  Carregar mais
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function AuditRow({ entry }: { entry: any }) {
  const destrutiva = isDestructiveAction(entry.action);
  const envKeys = Array.isArray(entry.metadata?.envKeys) ? (entry.metadata.envKeys as string[]) : null;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3',
        !entry.success
          ? 'border-destructive/40'
          : destrutiva
            ? 'border-warning/40'
            : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!entry.success && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}

        <span className={cn('text-sm font-medium', destrutiva ? 'text-warning' : 'text-foreground')}>
          {actionLabel(entry.action)}
        </span>

        {entry.targetName && <span className="font-mono text-sm text-muted-foreground">{entry.targetName}</span>}

        {entry.targetType === 'app' && entry.targetId && (
          <Link to={`/apps/${entry.targetId}`} className="text-xs text-primary hover:underline">
            abrir
          </Link>
        )}

        {!entry.success && <span className="text-xs text-destructive">(falhou)</span>}

        <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <User className="h-3 w-3" />
          {entry.userEmail ?? 'anônimo'}
        </span>
        {entry.ip && <span className="font-mono">{entry.ip}</span>}
      </div>

      {/* Só os NOMES das chaves — nunca os valores. */}
      {envKeys && envKeys.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Variáveis enviadas: <span className="font-mono text-foreground">{envKeys.join(', ')}</span>
        </p>
      )}

      {entry.metadata && Object.keys(entry.metadata).filter((k) => k !== 'envKeys').length > 0 && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {Object.entries(entry.metadata)
            .filter(([key]) => key !== 'envKeys')
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}
