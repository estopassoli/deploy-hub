import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { toStatus } from '@/lib/app-status';
import type { Status } from '@/components/ds/status';

/**
 * Apps e projetos juntos, na forma que o shell e a Visão geral consomem.
 *
 * Existe para que a sidebar, a paleta ⌘K e a tabela leiam **a mesma** árvore: antes
 * cada tela buscava por conta própria e a sidebar refazia o fetch a cada navegação,
 * porque o shell remontava por página.
 */
export interface FleetApp {
  id: string;
  name: string;
  status: Status;
  domain: string | null;
  port: number;
  projectId?: string | null;
  cpu?: number | null;
  memory?: number | null;
  uptime?: string | null;
  branch?: string | null;
  type?: string | null;
  activeRuntime?: string | null;
  isPreview?: boolean;
}

export interface FleetGroup {
  id: string;
  name: string;
  /** `null` no grupo sintético de apps sem projeto. */
  projectId: string | null;
  apps: FleetApp[];
}

export interface Fleet {
  apps: FleetApp[];
  groups: FleetGroup[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Nome do grupo dos apps que não pertencem a nenhum project. */
export const AVULSOS = 'Apps avulsos';

export function groupApps(apps: FleetApp[], projects: { id: string; name: string }[]): FleetGroup[] {
  const porProjeto = new Map<string, FleetGroup>();
  for (const projeto of projects) {
    porProjeto.set(projeto.id, { id: projeto.id, name: projeto.name, projectId: projeto.id, apps: [] });
  }

  const avulsos: FleetGroup = { id: '__avulsos__', name: AVULSOS, projectId: null, apps: [] };

  for (const app of apps) {
    const grupo = app.projectId ? porProjeto.get(app.projectId) : undefined;
    (grupo ?? avulsos).apps.push(app);
  }

  const grupos = [...porProjeto.values()].filter((g) => g.apps.length > 0);
  grupos.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (avulsos.apps.length) grupos.push(avulsos);
  return grupos;
}

export function useFleet(): Fleet {
  const [apps, setApps] = useState<FleetApp[]>([]);
  const [groups, setGroups] = useState<FleetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [rawApps, rawProjects] = await Promise.all([
        api.getApps(),
        api.getProjects().catch(() => [] as any[]),
      ]);

      const lista: FleetApp[] = (rawApps ?? []).map((app: any) => ({
        id: app.id,
        name: app.name,
        status: toStatus(app.status),
        domain: app.domain ?? null,
        port: app.port,
        projectId: app.projectId ?? null,
        cpu: app.cpu ?? null,
        memory: app.memory ?? null,
        uptime: app.uptime ?? null,
        branch: app.branch ?? null,
        type: app.type ?? null,
        activeRuntime: app.activeRuntime ?? null,
        isPreview: Boolean(app.isPreview),
      }));

      setApps(lista);
      setGroups(groupApps(lista, rawProjects ?? []));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar os apps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { apps, groups, loading, error, reload };
}
