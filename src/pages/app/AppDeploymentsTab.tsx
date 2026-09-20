import { useCallback, useEffect, useState } from 'react';
import { Eraser, FileText, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { EM_DASH, formatAbsolute, formatElapsed, formatRelative } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout, DataTable, EmptyState, IconButton, TH, TableHead, TableRow, TableRowGroup, Tag } from '@/components/ds';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
import { useApp } from './AppContext';

/**
 * Histórico de releases do app.
 *
 * ## A escolha da fonte, e por que ela precisa estar escrita na tela
 *
 * 16 dos 21 apps são services de monorepo, e os deploys de project são gravados com
 * `projectId` — não com `appId`. Consultar só por app devolve lista vazia para eles, e
 * era por isso que o painel mostrava "Last deploy: Never" em 21 de 21 cards **com 215
 * deploys no banco**.
 *
 * Aqui a aba escolhe a fonte pelo tipo do app e **diz qual escolheu**, porque a
 * diferença importa: num service, o rollback afeta todos os services do projeto.
 *
 * ## Quando Rollback fica desabilitado, e o motivo aparece
 *
 * - release que falhou: não deixou release em disco;
 * - release atual: não pode ser alvo de si mesma.
 *
 * Oferecer rollback para uma release `failed` é oferecer uma ação que não pode dar
 * certo — o backend hoje aceita, e isso está na lista de correções pendentes.
 */
const GRID = 'grid-cols-[96px_minmax(0,1fr)_132px_112px_88px_92px] max-xl:grid-cols-[96px_minmax(0,1fr)_112px_92px] max-md:grid-cols-[minmax(0,1fr)_92px]';

export default function AppDeploymentsTab() {
  const { app, reload } = useApp();
  const ehService = Boolean(app.projectId && app.project);

  const [releases, setReleases] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [limpando, setLimpando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      if (ehService) {
        const projeto = await api.getProject(app.project.id);
        setReleases(projeto.deploys ?? []);
      } else {
        setReleases(await api.getAppVersions(app.id));
      }
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar as releases');
      setReleases([]);
    }
  }, [app, ehService]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const rollback = async (release: any) => {
    const escopo = ehService
      ? `Isso volta TODOS os ${app.project.services?.length ?? ''} services de ${app.project.name}.`
      : `Isso volta ${app.name} para ${release.version}.`;
    if (!window.confirm(`${escopo}\n\nContinuar?`)) return;

    setOcupado(release.id);
    try {
      if (ehService) await api.rollbackProject(app.project.id, release.id);
      else await api.rollbackApp(app.id, release.id);
      toast.success(`Voltou para ${release.version}`);
      await Promise.all([carregar(), reload()]);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível fazer rollback');
    } finally {
      setOcupado(null);
    }
  };

  const apagar = async (release: any) => {
    setOcupado(release.id);
    try {
      await api.deleteVersion(app.id, release.id);
      toast.success(`Release ${release.version} removida do disco`);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível remover a release');
    } finally {
      setOcupado(null);
    }
  };

  const limparAntigas = async () => {
    setLimpando(true);
    try {
      const { removed, failed } = await api.pruneVersions(app.id, 0);
      if (failed.length) {
        toast.warning(`${removed} removida(s); ${failed.length} falharam`);
      } else {
        toast.success(
          removed === 0 ? 'Nada a remover — só existe a release atual' : `${removed} release(s) removida(s)`,
        );
      }
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível limpar as releases');
    } finally {
      setLimpando(false);
    }
  };

  // Quantas dá para apagar: tudo que não é a release no ar.
  const antigas = (releases ?? []).filter((r) => !(r.isCurrent || r.version === app.currentVersion)).length;

  if (releases === null) {
    return (
      <div className="flex flex-col gap-px">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag>{ehService ? `Escopo do projeto · ${app.project.name}` : 'Escopo do app'}</Tag>
        <p className="m-0 min-w-0 flex-1 text-xs leading-4 text-text-3">
          {ehService
            ? 'Este app é um service de monorepo, então as releases são do projeto — e o rollback vale para todos os services dele.'
            : 'App avulso: estas releases são dele.'}
        </p>

        {!ehService && antigas > 0 && (
          <ConfirmDeleteDialog
            name={app.name}
            title={`Apagar ${antigas} release(s) antiga(s)?`}
            description={
              <>
                <p>
                  Os diretórios em <span className="font-mono">~/apps/{app.name}/releases</span> são
                  apagados do disco. A release que está no ar é mantida.
                </p>
                <p>
                  Depois disso não há para onde fazer rollback: o histórico fica só com a atual.
                </p>
              </>
            }
            confirmLabel={`Apagar ${antigas}`}
            onConfirm={limparAntigas}
            trigger={
              <Button variant="secondary" size="xs" aria-busy={limpando ? 'true' : undefined}>
                <Eraser aria-hidden />
                Limpar antigas ({antigas})
              </Button>
            }
          />
        )}
      </div>

      {erro && <Callout tone="red" title="Não foi possível carregar as releases">{erro}</Callout>}

      {releases.length === 0 ? (
        <EmptyState
          title="Nenhum deploy ainda"
          description="O histórico aparece aqui depois do primeiro deploy deste app."
        />
      ) : (
        <DataTable label={`Releases de ${app.name}`}>
          <TableHead grid={GRID}>
            <span role="columnheader" className={TH}>Status</span>
            <span role="columnheader" className={TH}>Commit</span>
            <span role="columnheader" className={cn(TH, 'max-xl:hidden')}>Release</span>
            <span role="columnheader" className={TH}>Quando</span>
            <span role="columnheader" className={cn(TH, 'text-right max-xl:hidden')}>Duração</span>
            <span role="columnheader" className={cn(TH, 'text-right')}>Ações</span>
          </TableHead>

          <TableRowGroup>
            {releases.map((release) => {
              const sucesso = release.status === 'success';
              const atual = release.isCurrent || release.version === app.currentVersion;
              const motivo = !sucesso
                ? 'Release que falhou não deixou arquivos em disco'
                : atual
                  ? 'Já é a release atual'
                  : undefined;

              return (
                <TableRow key={release.id} grid={GRID} selected={atual}>
                  <span role="cell">
                    <Badge tone={sucesso ? 'accent' : release.status === 'failed' ? 'red' : 'amber'}>
                      {sucesso ? 'Ready' : release.status === 'failed' ? 'Failed' : release.status}
                    </Badge>
                  </span>

                  <div role="cell" className="flex min-w-0 flex-col justify-center">
                    <span className="truncate text-[13px] leading-5 text-text-1" title={release.commitMessage}>
                      {release.commitMessage || 'Sem mensagem de commit'}
                    </span>
                    {release.commitHash && (
                      <span className="font-mono tabular-nums text-2xs leading-4 text-text-3">
                        {release.commitHash.slice(0, 7)}
                      </span>
                    )}
                  </div>

                  <span role="cell" className="truncate font-mono tabular-nums text-xs text-text-2 max-xl:hidden">
                    {release.version}
                    {atual && <span className="ml-1.5 text-2xs text-accent">atual</span>}
                  </span>

                  <span role="cell" className="font-mono tabular-nums text-xs text-text-2">
                    <time dateTime={release.createdAt} title={formatAbsolute(release.createdAt)}>
                      {formatRelative(release.createdAt, { units: 1 })}
                    </time>
                  </span>

                  <span role="cell" className="text-right font-mono tabular-nums text-xs text-text-2 max-xl:hidden">
                    {formatElapsed(release.startedAt ?? release.createdAt, release.finishedAt) || EM_DASH}
                  </span>

                  <span role="cell" className="flex items-center justify-end gap-1">
                    <IconButton
                      label={`Ver o log do deploy ${release.version}`}
                      icon={<FileText aria-hidden />}
                      onClick={async () => {
                        try {
                          const data = await api.getDeployLogs(release.id);
                          toast.message(`Log de ${release.version}`, {
                            description: (data.logs || '').split('\n').slice(-12).join('\n'),
                            duration: 15000,
                          });
                        } catch (e: any) {
                          toast.error(e?.message || 'Erro ao carregar o log');
                        }
                      }}
                    />
                    <IconButton
                      label={motivo ? `Rollback indisponível — ${motivo}` : `Voltar para ${release.version}`}
                      icon={<RotateCcw aria-hidden />}
                      disabled={Boolean(motivo)}
                      aria-busy={ocupado === release.id ? 'true' : undefined}
                      onClick={() => rollback(release)}
                    />
                    {!ehService && (
                      <ConfirmDeleteDialog
                        name={release.version}
                        title={`Apagar a release ${release.version}?`}
                        description={
                          <>
                            <p>
                              O diretório <span className="font-mono">{release.path || release.version}</span> é
                              apagado do disco, e a linha sai do histórico.
                            </p>
                            <p>Depois disso não dá mais para fazer rollback para ela.</p>
                          </>
                        }
                        confirmLabel="Apagar release"
                        disabled={atual}
                        onConfirm={() => apagar(release)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={atual}
                            title={atual ? 'A release que está no ar não pode ser apagada' : undefined}
                            aria-label={
                              atual
                                ? 'Apagar indisponível: esta release está no ar'
                                : `Apagar a release ${release.version}`
                            }
                            className="text-text-3 hover:text-red"
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        }
                      />
                    )}
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
