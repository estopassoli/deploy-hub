import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Linha compacta de app.
 *
 * O card completo mostra domínio, status, uptime, branch, CPU e memória — informação
 * útil para um app e ruído para vinte. Esta linha mantém só o que responde "está tudo
 * bem?" e leva para a página de detalhe quando a resposta for não.
 */

interface AppCompactRowProps {
  app: any;
}

const STATUS_LABEL: Record<string, string> = {
  running: 'rodando',
  stopped: 'parado',
  error: 'erro',
  deploying: 'deployando',
};

export function AppCompactRow({ app }: AppCompactRowProps) {
  const color = app.status === 'running' ? 'bg-success' : app.hasProblem ? 'bg-destructive' : 'bg-muted-foreground';

  return (
    <Link
      to={`/apps/${app.id}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/30"
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', color, app.status === 'running' && 'animate-pulse')} />

      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{app.name}</span>

      {app.hasProblem && (
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="Fora do ar" />
      )}

      <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">:{app.port}</span>

      <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
        {STATUS_LABEL[app.status] ?? app.status}
      </span>

      <span className="hidden w-24 shrink-0 text-right font-mono text-xs text-muted-foreground lg:inline">
        {app.uptime || '-'}
      </span>

      <span className="hidden w-28 shrink-0 text-right font-mono text-xs text-muted-foreground lg:inline">
        {app.cpu ?? 0}% · {app.memory ?? 0}MB
      </span>

      {app.domain && (
        <span
          role="link"
          tabIndex={0}
          onClick={(event) => {
            // O <a> externo não pode ficar dentro do <Link>: HTML não permite âncora
            // aninhada, e o React avisa. Abrir na mão resolve sem quebrar a navegação.
            event.preventDefault();
            event.stopPropagation();
            window.open(`https://${app.domain}`, '_blank', 'noopener,noreferrer');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              window.open(`https://${app.domain}`, '_blank', 'noopener,noreferrer');
            }
          }}
          className="hidden shrink-0 cursor-pointer text-primary hover:underline sm:inline"
          title={`Abrir https://${app.domain}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      )}
    </Link>
  );
}
