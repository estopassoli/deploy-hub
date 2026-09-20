import { Boxes, LayoutGrid, Rocket, ScrollText, Search, Settings, SquareTerminal } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { StatusDot, aggregateStatus } from '@/components/ds/status';
import type { FleetGroup } from '@/hooks/useFleet';
import { AccountRow } from './AccountRow';
import { HubMark } from './HubMark';

/**
 * Rail de 64px — de 768px a 1279px.
 *
 * ## O bug que isto conserta
 *
 * A sidebar tinha 256px fixos a partir de `md:` — **31% de um tablet de 834px**.
 * Sobravam 514px de conteúdo, e com 514px os layouts que assumem desktop disparavam:
 * três services do mesmo projeto viravam três cartões idênticos, distinguíveis só pela
 * porta. Com o rail sobram 722px, 208px a mais para a mesma tela.
 *
 * Todo alvo é 44×44. Nenhum `Kbd` aqui: o mapa de teclado é só desktop.
 */
const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutGrid, end: true },
  { to: '/deployments', label: 'Deployments', icon: Rocket },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/terminal', label: 'Terminal', icon: SquareTerminal },
];

const railItem =
  'grid size-11 place-items-center rounded-md text-text-2 transition-colors hover:bg-bg-2 hover:text-text-1';

export function RailTablet({
  groups,
  onSearch,
  onShortcuts,
}: {
  groups: FleetGroup[];
  onSearch: () => void;
  onShortcuts: () => void;
}) {
  const { pathname } = useLocation();
  const emProjeto = pathname.startsWith('/projects') || pathname.startsWith('/apps');
  const pior = aggregateStatus(groups.flatMap((g) => g.apps.map((a) => a.status)));

  return (
    <aside aria-label="Navegação" className="flex w-16 shrink-0 flex-col border-r border-line-1 bg-bg-1">
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-line-1">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent-strong text-bg-0">
          <HubMark className="size-5" />
        </span>
      </div>

      <div className="flex flex-col items-center gap-1 px-2.5 pt-3">
        <button type="button" onClick={onSearch} aria-label="Buscar ou executar" className={cn(railItem, 'border border-line-2 bg-bg-0 text-text-3')}>
          <Search className="size-5" aria-hidden />
        </button>
        <span aria-hidden className="h-1" />
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              aria-label={label}
              className={({ isActive }) => cn(railItem, isActive && 'bg-bg-3 text-text-1')}
            >
              <Icon className="size-5" aria-hidden />
            </NavLink>
          ))}

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Projetos"
                aria-label="Projetos"
                className={cn(railItem, 'relative', emProjeto && 'bg-bg-3 text-text-1')}
              >
                <Boxes className="size-5" aria-hidden />
                {pior !== 'running' && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute right-1.5 top-1.5 block size-1.5 rounded-full',
                      pior === 'errored' || pior === 'failed' ? 'bg-red' : 'bg-amber',
                    )}
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" sideOffset={8} className="w-[296px] p-1">
              <ul className="m-0 flex list-none flex-col p-0">
                {groups.map((grupo) => {
                  const st = aggregateStatus(grupo.apps.map((a) => a.status));
                  const rodando = grupo.apps.filter((a) => a.status === 'running').length;
                  const parados = grupo.apps.filter((a) => a.status === 'stopped').length;
                  const quebrados = grupo.apps.filter((a) => a.status === 'errored' || a.status === 'failed').length;
                  return (
                    <li key={grupo.id}>
                      <NavLink
                        to={grupo.projectId ? `/projects/${grupo.projectId}` : '/'}
                        className="flex min-h-11 flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-2"
                      >
                        <span className="flex items-center gap-2">
                          <StatusDot status={st} />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-1">
                            {grupo.name}
                          </span>
                          <span className="font-mono tabular-nums text-2xs text-text-2">
                            {rodando}/{grupo.apps.length} running
                          </span>
                        </span>
                        {(parados > 0 || quebrados > 0) && (
                          <span className="flex items-center gap-1.5 pl-4">
                            {quebrados > 0 && <Badge tone="red">{quebrados} errored</Badge>}
                            {parados > 0 && <Badge tone="amber">{parados} stopped</Badge>}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        </nav>
      </div>

      <div className="flex-1" />

      <div className="flex w-16 flex-col items-center gap-1 border-t border-line-1 px-2.5 pb-3 pt-2">
        <NavLink
          to="/settings"
          title="Configurações"
          aria-label="Configurações"
          className={({ isActive }) => cn(railItem, isActive && 'bg-bg-3 text-text-1')}
        >
          <Settings className="size-5" aria-hidden />
        </NavLink>
        <div className="[&>button]:h-11 [&>button]:w-11 [&>button]:justify-center [&>button]:border-0 [&>button]:px-0 [&_span:nth-child(2)]:hidden [&_svg:last-child]:hidden">
          <AccountRow onShortcuts={onShortcuts} />
        </div>
      </div>
    </aside>
  );
}
