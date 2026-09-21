import { RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { EM_DASH, formatAbsolute, formatElapsed, formatRelative } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, EmptyState, IconButton, SelectionBar, TH, TableHead, TableRow, TableRowGroup, Tag } from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
import { useProject } from './ProjectContext';

/**
 * Releases do projeto. O rollback aqui afeta **todos** os services — e a confirmação
 * diz isso com o número, porque é o tipo de coisa que não se descobre depois.
 */
const GRID =
  'grid-cols-[32px_96px_minmax(0,1fr)_132px_112px_88px_92px] ' +
  'max-xl:grid-cols-[44px_96px_minmax(0,1fr)_112px_92px]';

export default function ProjectDeploymentsTab() {
  const { project, reload } = useProject();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [apagando, setApagando] = useState(false);

  const deploys = project.deploys ?? [];
  const services = project.apps ?? project.services ?? [];

  /**
   * Só releases que não estão no ar podem ser marcadas.
   *
   * A que está em produção nem ganha caixa — bloquear no clique deixaria o usuário
   * marcar e só descobrir na hora de apagar. O servidor recusa de novo, por garantia:
   * ele lê o symlink `current` de cada service, que é a verdade do disco.
   */
  const elegiveis = useMemo(() => deploys.filter((d: any) => !d.isCurrent), [deploys]);
  const todasMarcadas = elegiveis.length > 0 && marcadas.size === elegiveis.length;

  const alternar = (id: string) =>
    setMarcadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  const apagarSelecionadas = async () => {
    setApagando(true);
    try {
      const { removed, failed } = await api.deleteProjectDeploys(project.id, [...marcadas]);
      if (failed.length) {
        toast.warning(`${removed} removida(s) · ${failed.length} recusada(s)`, {
          description: failed.slice(0, 3).join(' · '),
          duration: 12000,
        });
      } else {
        toast.success(`${removed} release(s) removida(s) do disco`);
      }
      setMarcadas(new Set());
      await reload();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível apagar as releases');
    } finally {
      setApagando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag>Escopo do projeto · {services.length} services</Tag>
        <p className="m-0 text-xs leading-4 text-text-3">
          Um rollback aqui volta todos os services de {project.name} para a release escolhida.
        </p>
      </div>

      <SelectionBar count={marcadas.size} onClear={() => setMarcadas(new Set())}>
        <ConfirmDeleteDialog
          name={project.name}
          title={`Apagar ${marcadas.size} release(s)?`}
          description={
            <>
              <p>
                Os diretórios são removidos do disco e as linhas saem do histórico. A release
                que está no ar não é tocada.
              </p>
              <p>Depois disso não dá mais para fazer rollback para nenhuma delas.</p>
            </>
          }
          confirmLabel={`Apagar ${marcadas.size}`}
          onConfirm={apagarSelecionadas}
          trigger={
            <Button variant="destructive" size="xs" aria-busy={apagando ? 'true' : undefined}>
              <Trash2 aria-hidden />
              Apagar selecionadas
            </Button>
          }
        />
      </SelectionBar>

      {deploys.length === 0 ? (
        <EmptyState title="Nenhum deploy ainda" description="O histórico aparece depois do primeiro deploy." />
      ) : (
        <DataTable label={`Releases de ${project.name}`}>
          <TableHead grid={GRID}>
            <span role="columnheader" className="flex items-center">
              <Checkbox
                checked={todasMarcadas ? true : marcadas.size > 0 ? 'indeterminate' : false}
                disabled={elegiveis.length === 0}
                aria-label={todasMarcadas ? 'Desmarcar todas' : 'Marcar todas as releases apagáveis'}
                onCheckedChange={() =>
                  setMarcadas(todasMarcadas ? new Set() : new Set(elegiveis.map((d: any) => d.id)))
                }
              />
            </span>
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
                <TableRow key={d.id} grid={GRID} selected={marcadas.has(d.id)}>
                  <span role="cell" className="flex items-center">
                    {d.isCurrent ? (
                      <span
                        className="text-2xs text-text-3"
                        title="A release que está no ar não pode ser apagada"
                        aria-label="Esta release está no ar e não pode ser apagada"
                      >
                        —
                      </span>
                    ) : (
                      <Checkbox
                        checked={marcadas.has(d.id)}
                        aria-label={`Selecionar a release ${d.version}`}
                        onCheckedChange={() => alternar(d.id)}
                      />
                    )}
                  </span>
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
                    <IconButton
                      label={
                        sucesso
                          ? `Voltar os ${services.length} services para ${d.version}`
                          : 'Rollback indisponível — release que falhou não deixou arquivos em disco'
                      }
                      icon={<RotateCcw aria-hidden />}
                      disabled={!sucesso}
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
                    />
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
