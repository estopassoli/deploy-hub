import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { EM_DASH, formatAbsolute, formatElapsed, formatRelative } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, EmptyState, TH, TableHead, TableRow, TableRowGroup, Tag } from '@/components/ds';
import { useProject } from './ProjectContext';

/**
 * Releases do projeto. O rollback aqui afeta **todos** os services — e a confirmação
 * diz isso com o número, porque é o tipo de coisa que não se descobre depois.
 */
const GRID = 'grid-cols-[96px_minmax(0,1fr)_132px_112px_88px_92px] max-xl:grid-cols-[96px_minmax(0,1fr)_112px_92px]';

export default function ProjectDeploymentsTab() {
  const { project, reload } = useProject();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const deploys = project.deploys ?? [];
  const services = project.apps ?? project.services ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag>Escopo do projeto · {services.length} services</Tag>
        <p className="m-0 text-xs leading-4 text-text-3">
          Um rollback aqui volta todos os services de {project.name} para a release escolhida.
        </p>
      </div>

      {deploys.length === 0 ? (
        <EmptyState title="Nenhum deploy ainda" description="O histórico aparece depois do primeiro deploy." />
      ) : (
        <DataTable label={`Releases de ${project.name}`}>
          <TableHead grid={GRID}>
            <span role="columnheader" className={TH}>Status</span>
            <span role="columnheader" className={TH}>Commit</span>
            <span role="columnheader" className={cn(TH, 'max-xl:hidden')}>Release</span>
            <span role="columnheader" className={TH}>Quando</span>
            <span role="columnheader" className={cn(TH, 'text-right max-xl:hidden')}>Duração</span>
            <span role="columnheader" className={cn(TH, 'text-right')}>Ações</span>
          </TableHead>
          <TableRowGroup>
            {deploys.map((d: any) => {
              const sucesso = d.status === 'success';
              return (
                <TableRow key={d.id} grid={GRID}>
                  <span role="cell">
                    <Badge tone={sucesso ? 'accent' : d.status === 'failed' ? 'red' : 'amber'}>
                      {sucesso ? 'Ready' : d.status === 'failed' ? 'Failed' : d.status}
                    </Badge>
                  </span>
                  <div role="cell" className="flex min-w-0 flex-col justify-center">
                    <span className="truncate text-[13px] leading-5 text-text-1" title={d.commitMessage}>
                      {d.commitMessage || 'Sem mensagem de commit'}
                    </span>
                    {d.commitHash && (
                      <span className="font-mono tabular-nums text-2xs leading-4 text-text-3">
                        {d.commitHash.slice(0, 7)}
                      </span>
                    )}
                  </div>
                  <span role="cell" className="truncate font-mono tabular-nums text-xs text-text-2 max-xl:hidden">
                    {d.version}
                  </span>
                  <span role="cell" className="font-mono tabular-nums text-xs text-text-2">
                    <time dateTime={d.createdAt} title={formatAbsolute(d.createdAt)}>
                      {formatRelative(d.createdAt, { units: 1 })}
                    </time>
                  </span>
                  <span role="cell" className="text-right font-mono tabular-nums text-xs text-text-2 max-xl:hidden">
                    {formatElapsed(d.startedAt ?? d.createdAt, d.finishedAt) || EM_DASH}
                  </span>
                  <span role="cell" className="flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={!sucesso}
                      title={sucesso ? undefined : 'Release que falhou não deixou arquivos em disco'}
                      aria-label={`Rollback para ${d.version}`}
                      aria-busy={ocupado === d.id ? 'true' : undefined}
                      onClick={async () => {
                        if (!window.confirm(`Isso volta os ${services.length} services de ${project.name} para ${d.version}. Continuar?`))
                          return;
                        setOcupado(d.id);
                        try {
                          await api.rollbackProject(project.id, d.id);
                          toast.success(`Voltou para ${d.version}`);
                          await reload();
                        } catch (e: any) {
                          toast.error(e?.message || 'Não foi possível fazer rollback');
                        } finally {
                          setOcupado(null);
                        }
                      }}
                    >
                      <RotateCcw aria-hidden />
                    </Button>
                  </span>
                </TableRow>
              );
            })}
          </TableRowGroup>
        </DataTable>
      )}
    </div>
  );
}
