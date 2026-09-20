import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Play, RefreshCw, RotateCcw, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { EM_DASH, formatMB, formatPercent } from '@/lib/format';
import { byProblemFirst, primaryAction, toStatus } from '@/lib/app-status';
import { Button } from '@/components/ui/button';
import { DataTable, EmptyState, IconButton, StatusLabel, TH, TableHead, TableRow, TableRowGroup } from '@/components/ds';
import { AppRowActions } from '@/components/apps/AppRowActions';
import { DeployLogPanel } from '@/components/projects/DeployLogPanel';
import { AddServiceForm } from '@/components/projects/AddServiceForm';
import { useProject } from './ProjectContext';

/**
 * Services do projeto, na mesma tabela da Visão geral.
 *
 * Substitui os `ServiceConfigCard` — cartões de configuração que misturavam leitura e
 * edição, e onde o botão "Deploy service" rodava com a configuração não salva.
 */
const GRID =
  'grid-cols-[66px_180px_minmax(0,1fr)_48px_84px_92px] max-xl:grid-cols-[80px_minmax(0,1fr)_72px_84px_96px] max-md:grid-cols-[minmax(0,1fr)_132px_44px]';

export default function ProjectServicesTab() {
  const { project, reload } = useProject();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const services = [...(project.apps ?? project.services ?? [])]
    .map((s: any) => ({ ...s, _status: toStatus(s.status) }))
    .sort((a, b) => byProblemFirst({ status: a._status, name: a.name }, { status: b._status, name: b.name }));

  const executar = async (service: any, acao: 'start' | 'stop' | 'restart' | 'redeploy') => {
    setOcupado(service.id);
    try {
      if (acao === 'redeploy') await api.redeploy(service.id);
      else if (acao === 'start') await api.startApp(service.id);
      else if (acao === 'stop') await api.stopApp(service.id);
      else await api.restartApp(service.id);
      toast.success(`${acao} enviado para ${service.name}`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível executar a ação');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {services.length === 0 ? (
        <EmptyState title="Nenhum service" description="Adicione o primeiro service deste monorepo." />
      ) : (
        <div className="-mx-8 max-xl:-mx-4 max-md:-mx-4">
          <DataTable label={`Services de ${project.name}`}>
            <TableHead grid={GRID}>
              <span role="columnheader" className={TH}>Status</span>
              <span role="columnheader" className={TH}>Service</span>
              <span role="columnheader" className={cn(TH, 'max-xl:hidden')}>Domínio</span>
              <span role="columnheader" className={cn(TH, 'text-right')}>CPU</span>
              <span role="columnheader" className={cn(TH, 'text-right')}>Mem</span>
              <span role="columnheader" className={cn(TH, 'text-right')}>Ações</span>
            </TableHead>

            <TableRowGroup>
              {services.map((service: any) => {
                const status = service._status;
                const vivo = status === 'running';
                const acao = primaryAction(status);
                return (
                  <TableRow key={service.id} grid={GRID}>
                    <span role="cell" className="max-md:hidden">
                      <StatusLabel status={status} />
                    </span>

                    <div role="cell" className="min-w-0">
                      <Link
                        to={`/apps/${encodeURIComponent(service.name)}`}
                        className="flex h-6 items-center gap-2 whitespace-nowrap text-[13px] leading-5 max-md:h-auto max-md:flex-col max-md:items-start"
                      >
                        <span className="font-medium text-text-1 max-md:text-[15px]">{service.name}</span>
                        <span className="font-mono tabular-nums text-2xs text-text-3 max-md:text-[13px]">
                          {service.workspacePackage || service.appDir || EM_DASH}
                        </span>
                      </Link>
                    </div>

                    <div role="cell" className="min-w-0 max-xl:hidden">
                      {service.domain ? (
                        <a
                          href={`https://${service.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-6 min-w-0 items-center gap-1 text-text-2 transition-colors hover:text-text-1"
                        >
                          <span className="truncate font-mono tabular-nums text-xs">{service.domain}</span>
                          <span className="font-mono tabular-nums text-2xs text-text-3">:{service.port}</span>
                          <ExternalLink className="size-3 shrink-0 text-text-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="font-mono tabular-nums text-xs text-text-3">
                          {EM_DASH} :{service.port}
                        </span>
                      )}
                    </div>

                    <span role="cell" className="text-right font-mono tabular-nums text-xs text-text-2 max-md:hidden">
                      {vivo ? formatPercent(service.cpu) : EM_DASH}
                    </span>
                    <span role="cell" className="text-right font-mono tabular-nums text-xs text-text-2 max-md:hidden">
                      {vivo ? formatMB(service.memory) : EM_DASH}
                    </span>

                    <span role="cell" className="hidden flex-col items-end max-md:flex">
                      <StatusLabel status={status} />
                    </span>

                    <span role="cell" className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-xs" aria-label={`Logs de ${service.name}`} asChild className="max-xl:hidden">
                        <Link to={`/apps/${encodeURIComponent(service.name)}/logs`}>
                          <ScrollText aria-hidden />
                        </Link>
                      </Button>
                      <IconButton
                        label={`${acao} de ${service.name}`}
                        icon={
                          acao === 'Redeploy' ? <RefreshCw aria-hidden /> : acao === 'Start' ? <Play aria-hidden /> : <RotateCcw aria-hidden />
                        }
                        aria-busy={ocupado === service.id ? 'true' : undefined}
                        onClick={() =>
                          executar(service, acao === 'Redeploy' ? 'redeploy' : acao === 'Start' ? 'start' : 'restart')
                        }
                        className="max-xl:hidden"
                      />
                      <AppRowActions
                        app={{
                          id: service.id,
                          name: service.name,
                          status,
                          domain: service.domain ?? null,
                          port: service.port,
                          cpu: service.cpu,
                          memory: service.memory,
                          uptime: service.uptime,
                        }}
                        busy={ocupado === service.id}
                        onLifecycle={(a) => executar(service, a)}
                        onDelete={async () => {
                          if (!window.confirm(`Excluir o service ${service.name}?`)) return;
                          await api.deleteApp(service.id);
                          toast.success(`${service.name} removido`);
                          await reload();
                        }}
                      />
                    </span>
                  </TableRow>
                );
              })}
            </TableRowGroup>
          </DataTable>
        </div>
      )}

      <AddServiceForm projectId={project.id} projectName={project.name} onAdded={reload} />
      <DeployLogPanel projectName={project.name} />
    </div>
  );
}
