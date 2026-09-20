import { createContext, useContext } from 'react';

export interface AppCtx {
  app: any;
  reload: (withForm?: boolean) => Promise<void>;
  /** Chave do stream de deploy: o nome do projeto quando é service de monorepo. */
  deployKey: string;
  openDeploySheet: () => void;
}

const Ctx = createContext<AppCtx | null>(null);
export const AppProvider = Ctx.Provider;

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp precisa estar dentro de AppPage');
  return ctx;
}
