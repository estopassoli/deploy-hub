import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Check, Loader2, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { toast } from 'sonner';

/**
 * Disponibilidade externa do domínio e validade do certificado.
 *
 * O painel já mostrava se o **processo** estava vivo. Isso não responde à pergunta que
 * o usuário final faz — *o site abre?*. Um app pode estar perfeitamente vivo no PM2 e
 * inacessível por certificado vencido, vhost apagado ou DNS mudado; o monitor faz a
 * requisição pelo caminho completo (DNS → nginx → TLS → app).
 */

interface UptimePanelProps {
  appId: string;
  domain?: string | null;
}

export function UptimePanel({ appId, domain }: UptimePanelProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.getUptime(appId, 24));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    load();
  }, [load]);

  const checkNow = async () => {
    setChecking(true);
    try {
      const resultado = await api.checkUptimeNow(appId);
      toast[resultado.status === 'up' ? 'success' : 'error'](
        resultado.status === 'up'
          ? `Respondeu HTTP ${resultado.statusCode} em ${resultado.responseMs}ms`
          : `Fora do ar: ${resultado.error ?? 'sem detalhe'}`,
      );
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao checar');
    } finally {
      setChecking(false);
    }
  };

  if (!domain) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Configure um domínio para monitorar a disponibilidade e o certificado.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando monitoramento...
      </div>
    );
  }

  const status = data?.currentStatus;
  const ssl = data?.ssl ?? {};

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Monitoramento externo</h3>
        </div>
        <Button variant="secondary" disabled={checking} onClick={checkNow}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Checar agora
        </Button>
      </div>

      <p className="font-mono text-xs text-muted-foreground">https://{domain}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metrica
          label="Estado"
          value={status === 'up' ? 'No ar' : status === 'down' ? 'Fora do ar' : 'Sem dados'}
          tone={status === 'up' ? 'success' : status === 'down' ? 'error' : 'muted'}
          icon={status === 'up' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        />
        <Metrica
          label="Disponibilidade (24h)"
          value={data?.uptimePercentage !== null && data?.uptimePercentage !== undefined ? `${data.uptimePercentage}%` : '-'}
          tone={
            data?.uptimePercentage === null || data?.uptimePercentage === undefined
              ? 'muted'
              : data.uptimePercentage >= 99
                ? 'success'
                : data.uptimePercentage >= 95
                  ? 'warning'
                  : 'error'
          }
        />
        <Metrica
          label="Resposta média"
          value={data?.averageResponseMs ? `${data.averageResponseMs}ms` : '-'}
          tone="muted"
        />
      </div>

      {/* Certificado */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm',
          ssl.status === 'expired'
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : ssl.status === 'expiring'
              ? 'border-warning/40 bg-warning/10 text-warning'
              : 'border-border text-muted-foreground',
        )}
      >
        {ssl.status === 'ok' ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        {ssl.status === 'unknown' ? (
          <span>Certificado ainda não verificado. A leitura roda diariamente às 6h.</span>
        ) : ssl.status === 'expired' ? (
          <span>
            Certificado <strong>vencido</strong> em {formatDateTime(ssl.expiresAt)}.
          </span>
        ) : (
          <span>
            Certificado válido até {formatDateTime(ssl.expiresAt)} —{' '}
            <strong>{ssl.daysRemaining} dia(s)</strong> restantes.
            {ssl.status === 'expiring' && ' Renovação recomendada.'}
          </span>
        )}
      </div>

      {/* Últimas checagens */}
      {data?.checks?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Últimas 24h — {data.checks.length} checagens</p>
          <div className="flex flex-wrap gap-0.5">
            {data.checks.slice(-96).map((check: any, index: number) => (
              <span
                key={index}
                title={`${formatDateTime(check.checkedAt)} — ${check.status === 'up' ? `HTTP ${check.statusCode} (${check.responseMs}ms)` : check.error}`}
                className={cn(
                  'h-6 w-1.5 rounded-sm',
                  check.status === 'up' ? 'bg-success/70' : 'bg-destructive',
                )}
              />
            ))}
          </div>
        </div>
      )}

      {data?.lastCheckedAt && (
        <p className="text-xs text-muted-foreground">Última checagem: {formatDateTime(data.lastCheckedAt)}</p>
      )}
    </div>
  );
}

function Metrica({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'error' | 'muted';
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 flex items-center gap-1.5 font-medium',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'error' && 'text-destructive',
          tone === 'muted' && 'text-foreground',
        )}
      >
        {icon}
        {value}
      </p>
    </div>
  );
}
