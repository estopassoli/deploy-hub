import { createContext, useContext } from 'react';
import type { Fleet } from '@/hooks/useFleet';

/**
 * Apps e projetos carregados **uma vez**, pelo shell.
 *
 * Sem isto, a sidebar, a paleta e a Visão geral fariam três `GET /apps` por navegação —
 * era exatamente o que acontecia enquanto o shell remontava por página.
 */
const FleetContext = createContext<Fleet | null>(null);

export const FleetProvider = FleetContext.Provider;

export function useFleetContext(): Fleet {
  const fleet = useContext(FleetContext);
  if (!fleet) throw new Error('useFleetContext precisa estar dentro do AppShell');
  return fleet;
}
