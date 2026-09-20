import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Trilha `servidor / seção` ou `servidor / projeto / app`.
 *
 * Substitui os títulos de página soltos e os `← Dashboard` espalhados: a posição passa
 * a ser dita uma vez, no mesmo lugar, em toda rota.
 */
const SECOES: Record<string, string> = {
  '': 'Visão geral',
  new: 'Novo deploy',
  deployments: 'Deployments',
  logs: 'Logs',
  terminal: 'Terminal',
  settings: 'Configurações',
  audit: 'Auditoria',
  buscar: 'Buscar',
  apps: 'Apps',
  projects: 'Projetos',
};

export function useCrumbs(serverName: string): { label: string; to?: string }[] {
  const { pathname } = useLocation();
  const partes = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; to?: string }[] = [{ label: serverName, to: '/' }];

  if (partes.length === 0) {
    crumbs.push({ label: SECOES[''] });
    return crumbs;
  }

  if (partes[0] === 'apps' && partes[1]) {
    crumbs.push({ label: decodeURIComponent(partes[1]), to: `/apps/${partes[1]}` });
    if (partes[2]) crumbs.push({ label: SECOES[partes[2]] ?? partes[2] });
    return crumbs;
  }

  if (partes[0] === 'projects' && partes[1]) {
    crumbs.push({ label: 'Projetos' });
    crumbs.push({ label: decodeURIComponent(partes[1]) });
    return crumbs;
  }

  crumbs.push({ label: SECOES[partes[0]] ?? partes[0] });
  return crumbs;
}

export function Breadcrumb({ serverName }: { serverName: string }) {
  const crumbs = useCrumbs(serverName);

  return (
    <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1.5">
      {crumbs.map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3 shrink-0 text-text-3" aria-hidden />}
          {crumb.to && i < crumbs.length - 1 ? (
            <Link
              to={crumb.to}
              className="min-w-0 truncate font-mono text-xs tabular-nums text-text-3 transition-colors hover:text-text-2"
            >
              {crumb.label}
            </Link>
          ) : (
            <span
              aria-current={i === crumbs.length - 1 ? 'page' : undefined}
              className="min-w-0 truncate font-mono text-xs tabular-nums text-text-1"
              title={crumb.label}
            >
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
