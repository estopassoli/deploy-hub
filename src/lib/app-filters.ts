/**
 * Estado e lógica de filtragem da lista de apps.
 *
 * Separado do componente porque a página precisa aplicar o filtro para contar os
 * resultados — e porque exportar função e constante junto com um componente quebra o
 * fast refresh do Vite (`react-refresh/only-export-components`).
 */

export type AppStatusFilter = 'all' | 'running' | 'problem' | 'stopped';
export type AppViewMode = 'cards' | 'compact';

export interface AppFiltersState {
  search: string;
  status: AppStatusFilter;
  type: string;
  view: AppViewMode;
}

export const DEFAULT_APP_FILTERS: AppFiltersState = {
  search: '',
  status: 'all',
  type: 'all',
  view: 'cards',
};

export const APP_STATUS_OPTIONS: Array<{ value: AppStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'running', label: 'Rodando' },
  { value: 'problem', label: 'Com problema' },
  { value: 'stopped', label: 'Parados' },
];

export const APP_TYPE_OPTIONS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'nestjs', label: 'NestJS' },
  { value: 'nextjs', label: 'Next.js' },
  { value: 'vitejs', label: 'Vite' },
];

type FilterableApp = {
  name?: string;
  domain?: string | null;
  type?: string;
  status?: string;
  hasProblem?: boolean;
};

export function filterApps<T extends FilterableApp>(apps: T[], filters: AppFiltersState): T[] {
  const termo = filters.search.trim().toLowerCase();

  return apps.filter((app) => {
    if (termo) {
      const alvo = `${app.name ?? ''} ${app.domain ?? ''}`.toLowerCase();
      if (!alvo.includes(termo)) return false;
    }

    if (filters.type !== 'all' && app.type !== filters.type) return false;

    switch (filters.status) {
      case 'running':
        return app.status === 'running';
      case 'problem':
        return Boolean(app.hasProblem);
      case 'stopped':
        // Parado de propósito: está fora do ar, mas não é incidente.
        return app.status !== 'running' && !app.hasProblem;
      default:
        return true;
    }
  });
}
