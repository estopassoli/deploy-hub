import { Home, Menu, Plus, Rocket, ScrollText } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Tab bar do celular: cinco itens, alvo de 64px de altura.
 *
 * Substitui o drawer de oito destinos atrás de um hambúrguer de 40px no canto superior
 * **direito** — a pior combinação possível: muitos destinos, alvo pequeno e gatilho
 * longe do polegar.
 *
 * "Novo" é um círculo accent no centro **com rótulo visível**: um `+` sem palavra é
 * adivinhação.
 */
const tabItem =
  'relative flex min-w-14 flex-1 flex-col items-center justify-center gap-1 pt-2 text-2xs font-medium text-text-3 transition-colors';

export function TabBarMobile({ onMore }: { onMore: () => void }) {
  const navigate = useNavigate();

  const item = (to: string, Icon: typeof Home, label: string, end?: boolean) => (
    <NavLink key={to} to={to} end={end} className={({ isActive }) => cn(tabItem, isActive && 'text-text-1')}>
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent" />}
          <Icon className="size-5" aria-hidden />
          {label}
        </>
      )}
    </NavLink>
  );

  return (
    <nav
      aria-label="Navegação principal"
      className="flex h-16 shrink-0 items-stretch border-t border-line-1 bg-bg-1 px-1 pb-[env(safe-area-inset-bottom)]"
    >
      {item('/', Home, 'Início', true)}
      {item('/deployments', Rocket, 'Deploys')}

      <button
        type="button"
        onClick={() => navigate('/new')}
        className={cn(tabItem, 'gap-0.5 pt-1 text-text-1')}
        aria-label="Novo deploy"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-accent-strong text-bg-0">
          <Plus className="size-5" aria-hidden />
        </span>
        <span aria-hidden>Novo</span>
      </button>

      {item('/logs', ScrollText, 'Logs')}

      <button type="button" onClick={onMore} className={tabItem}>
        <Menu className="size-5" aria-hidden />
        Mais
      </button>
    </nav>
  );
}
