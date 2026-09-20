import { useCallback, useEffect, useState } from 'react';
import { FileText, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { EM_DASH, formatAbsolute, formatElapsed, formatRelative } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout, DataTable, EmptyState, TH, TableHead, TableRow, TableRowGroup, Tag } from '@/components/ds';
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
const GRID = 'grid-cols-[96px_minmax(0,1fr)_132px_112px_88px_120px] max-xl:grid-cols-[96px_minmax(0,1fr)_112px_120px] max-md:grid-cols-[minmax(0,1fr)_92px]';

export default function AppDeploymentsTab() {
  const { app, reload } = useApp();
  const ehService = Boolean(app.projectId && app.project);

  const [releases, setReleases] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

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
        <p className="m-0 text-xs leading-4 text-text-3">
          {ehService
            ? 'Este app é um service de monorepo, então as releases são do projeto — e o rollback vale para todos os services dele.'
            : 'App avulso: estas releases são dele.'}
        </p>
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
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Log do deploy ${release.version}`}
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
                    >
                      <FileText aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={Boolean(motivo)}
                      title={motivo}
                      aria-label={motivo ? `Rollback indisponível: ${motivo}` : `Rollback para ${release.version}`}
                      aria-busy={ocupado === release.id ? 'true' : undefined}
                      onClick={() => rollback(release)}
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
