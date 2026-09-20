import { LayoutGrid, List, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  APP_STATUS_OPTIONS,
  APP_TYPE_OPTIONS,
  AppFiltersState,
} from '@/lib/app-filters';

/**
 * Busca e filtros da lista de apps.
 *
 * Com 21 apps o Dashboard vira uma parede de cards: achar um específico é rolar e ler.
 * Pior no incidente — a pergunta é "quais estão fora do ar", e a resposta exigia
 * varrer a página inteira procurando bolinha vermelha.
 *
 * O modo compacto existe pelo mesmo motivo: o card completo mostra CPU, memória,
 * branch e domínio, o que é útil para um app e ruído para vinte.
 */

interface AppFiltersProps {
  value: AppFiltersState;
  onChange: (value: AppFiltersState) => void;
  /** Quantidade exibida / total, para o rótulo de resultado. */
  showing: number;
  total: number;
}

export function AppFilters({ value, onChange, showing, total }: AppFiltersProps) {
  const set = (patch: Partial<AppFiltersState>) => onChange({ ...value, ...patch });
  const filtering = value.search !== '' || value.status !== 'all' || value.type !== 'all';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Buscar por nome ou domínio..."
            className="pl-9"
          />
          {value.search && (
            <button
              type="button"
              onClick={() => set({ search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <select
          value={value.type}
          onChange={(e) => set({ type: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filtrar por tipo"
        >
          {APP_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-md border border-input p-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant={value.view === 'cards' ? 'secondary' : 'ghost'}
            onClick={() => set({ view: 'cards' })}
            title="Cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={value.view === 'compact' ? 'secondary' : 'ghost'}
            onClick={() => set({ view: 'compact' })}
            title="Lista compacta"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {APP_STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => set({ status: option.value })}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              value.status === option.value
                ? 'bg-primary/15 text-primary'
                : 'bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtering ? `${showing} de ${total} apps` : `${total} apps`}
        </span>
      </div>
    </div>
  );
}
