import { Link, useLocation } from 'react-router-dom';
import { useFleetOptional } from './FleetContext';
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
  env: 'Ambiente',
  git: 'Git e CI',
  services: 'Services',
};

export function useCrumbs(serverName: string): { label: string; to?: string }[] {
  const { pathname } = useLocation();
  // O segmento de projeto é um UUID. Sem resolver o nome, a trilha vira
  // `local / Projetos / 999df316-7584-425a-9193-1c6d62287c84`, que não diz nada.
  //
  // Opcional de propósito: o AppShell chama este hook para o título da aba antes de
  // montar o FleetProvider. Exigir o contexto aqui derruba a aplicação inteira.
  const fleet = useFleetOptional();
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
    const id = decodeURIComponent(partes[1]);
    const projeto = fleet?.groups.find((g) => g.projectId === id);
    crumbs.push({ label: 'Projetos' });
    crumbs.push({ label: projeto?.name ?? id });
    if (partes[2]) crumbs.push({ label: SECOES[partes[2]] ?? partes[2] });
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
