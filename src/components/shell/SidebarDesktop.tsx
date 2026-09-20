import { ChevronsUpDown, LayoutGrid, Rocket, ScrollText, Search, Settings, SquareTerminal } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Kbd, KbdCmd } from '@/components/ds/kbd';
import type { FleetGroup } from '@/hooks/useFleet';
import { AccountRow } from './AccountRow';
import { HubMark } from './HubMark';
import { ProjectTree } from './ProjectTree';
import { ServerMeters } from './ServerMeters';

/**
 * Sidebar de 240px — só em `xl:` (≥1280px). Ver `lib/breakpoints.ts` para o porquê.
 *
 * ## O que mudou na taxonomia
 *
 * A nav tinha nove itens, e **dois deles eram formulários de criação** ("Deploy" e
 * "Monorepo") disfarçados de destino. Ao mesmo tempo, a entidade com 21 instâncias —
 * apps — não aparecia em lugar nenhum.
 *
 * Agora são quatro destinos e a árvore de projetos logo abaixo: criar é o botão
 * primário do top bar, não um item de navegação.
 */
const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutGrid, end: true },
  { to: '/deployments', label: 'Deployments', icon: Rocket },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/terminal', label: 'Terminal', icon: SquareTerminal },
];

const navItem =
  'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-text-2 transition-colors hover:bg-bg-2';

export function SidebarDesktop({
  serverName,
  groups,
  stats,
  onSearch,
  onShortcuts,
}: {
  serverName: string;
  groups: FleetGroup[];
  stats?: { cpuUsage?: number; memoryUsage?: number; diskUsage?: number } | null;
  onSearch: () => void;
  onShortcuts: () => void;
}) {
  return (
    <aside aria-label="Navegação" className="flex w-60 shrink-0 flex-col border-r border-line-1 bg-bg-1">
      <div className="flex h-13 shrink-0 items-center gap-2.5 border-b border-line-1 px-4">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-strong text-bg-0">
          <HubMark className="size-[18px]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold leading-[18px] tracking-[-0.01em] text-text-1">DeployHub</span>
          <span className="truncate font-mono text-2xs leading-[14px] tabular-nums text-text-3">{serverName}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-text-3" aria-hidden />
      </div>

      <div className="flex flex-col gap-3 px-3 pt-3">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-line-2 bg-bg-0 pl-2.5 pr-1.5 text-[13px] text-text-3 transition-colors hover:border-line-3"
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          <span className="flex-1 text-left">Buscar ou executar…</span>
          <Kbd>
            <KbdCmd />K
          </Kbd>
        </button>

        <nav aria-label="Principal" className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(navItem, isActive && 'bg-bg-3 text-text-1')}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex min-h-0 flex-col px-3 pt-5">
        <div className="flex h-6 items-center px-2 text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">
          <span className="flex-1">Projetos</span>
          <span className="font-mono tabular-nums tracking-normal">{groups.length}</span>
        </div>
        <ProjectTree groups={groups} className="overflow-y-auto pt-1" />
      </div>

      <div className="flex-1" />

      <ServerMeters cpu={stats?.cpuUsage} memory={stats?.memoryUsage} disk={stats?.diskUsage} />

      <div className="flex flex-col border-t border-line-1 px-3 py-2">
        <NavLink to="/settings" className={({ isActive }) => cn(navItem, isActive && 'bg-bg-3 text-text-1')}>
          <Settings className="size-4 shrink-0" aria-hidden />
          Configurações
        </NavLink>
      </div>

      <AccountRow onShortcuts={onShortcuts} />
    </aside>
  );
}
