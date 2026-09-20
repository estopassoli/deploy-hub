import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { StatusDot, aggregateStatus } from '@/components/ds/status';
import type { FleetGroup } from '@/hooks/useFleet';

/**
 * Árvore de projetos da sidebar.
 *
 * A mesma gramática para toda linha, inclusive "Apps avulsos": dot na cor do pior
 * filho + nome + contagem à direita.
 *
 * A contagem é simples (`3`) quando todos rodam e fração (`1/4`) quando há problema —
 * é o que distingue, de relance, um projeto saudável de um que perdeu services.
 *
 * O `truncate` no nome do projeto é a **única** truncagem permitida na sidebar: o nome
 * completo aparece no breadcrumb e no `title`. Nome de app em tabela nunca trunca.
 */
export function ProjectTree({ groups, className }: { groups: FleetGroup[]; className?: string }) {
  return (
    <ul className={cn('m-0 flex list-none flex-col gap-px p-0', className)}>
      {groups.map((grupo) => {
        const pior = aggregateStatus(grupo.apps.map((a) => a.status));
        const rodando = grupo.apps.filter((a) => a.status === 'running').length;
        const rotulo = rodando === grupo.apps.length ? String(grupo.apps.length) : `${rodando}/${grupo.apps.length}`;
        const destino = grupo.projectId ? `/projects/${grupo.projectId}` : '/';

        return (
          <li key={grupo.id}>
            <NavLink
              to={destino}
              end={!grupo.projectId}
              title={grupo.name}
              className={({ isActive }) =>
                cn(
                  'flex h-7 items-center gap-2.5 rounded-md px-2 text-[13px] text-text-2 transition-colors hover:bg-bg-2',
                  isActive && grupo.projectId && 'bg-bg-3 text-text-1',
                )
              }
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                <StatusDot status={pior} />
              </span>
              <span className="min-w-0 flex-1 truncate">{grupo.name}</span>
              <span className="font-mono tabular-nums text-2xs text-text-3">{rotulo}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}
