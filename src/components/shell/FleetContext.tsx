import { createContext, useContext } from 'react';
import type { Fleet } from '@/hooks/useFleet';

/**
 * Apps e projetos carregados **uma vez**, pelo shell.
 *
 * Sem isto, a sidebar, a paleta e a Visão geral fariam três `GET /apps` por navegação —
 * era o que acontecia enquanto o shell remontava por página.
 */
const FleetContext = createContext<Fleet | null>(null);

export const FleetProvider = FleetContext.Provider;

/**
 * A frota, ou `null` fora do provider.
 *
 * Existe porque o próprio `AppShell` precisa de partes da frota **enquanto monta** —
 * o breadcrumb, por exemplo, resolve o nome do projeto e é calculado antes de o
 * provider existir na árvore. Exigir o provider ali derruba a aplicação inteira com
 * "useFleetContext precisa estar dentro do AppShell".
 */
export function useFleetOptional(): Fleet | null {
  return useContext(FleetContext);
}

/** A frota, para quem está garantidamente dentro do shell (páginas, telas). */
export function useFleetContext(): Fleet {
  const fleet = useContext(FleetContext);
  if (!fleet) throw new Error('useFleetContext precisa estar dentro do AppShell');
  return fleet;
}
