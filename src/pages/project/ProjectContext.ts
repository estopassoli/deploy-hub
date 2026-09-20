import { createContext, useContext } from 'react';

export interface ProjectCtx {
  project: any;
  reload: (withEnv?: boolean) => Promise<void>;
}

const Ctx = createContext<ProjectCtx | null>(null);
export const ProjectProvider = Ctx.Provider;

export function useProject(): ProjectCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProject precisa estar dentro de ProjectPage');
  return ctx;
}
