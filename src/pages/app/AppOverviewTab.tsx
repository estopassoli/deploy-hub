import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyValue, KeyValueList, Meter } from '@/components/ds';
import { UptimePanel } from '@/components/apps/UptimePanel';
import { EM_DASH, formatAbsolute, formatMB, formatPercent, formatRelative } from '@/lib/format';
import { useApp } from './AppContext';

/**
 * Visão geral do app: deployment atual, recursos, endereço e processo.
 *
 * Os quatro `InfoCard` de antes viravam `0%` e `0 MB` para app parado. Aqui um valor
 * ausente é travessão — zero é uma medição, ausência não é — e nenhum medidor é
 * desenhado ao lado de um travessão.
 */
export default function AppOverviewTab() {
  const { app } = useApp();
  const vivo = app.status === 'running';
  const ultimo = app.deploys?.[0];

  return (
    <div className="grid gap-4 @[900px]:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Deployment atual</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Release">{app.currentVersion || EM_DASH}</KeyValue>
              <KeyValue label="Commit" title={ultimo?.commitMessage}>
                {ultimo?.commitHash ? (
                  <>
                    {ultimo.commitHash.slice(0, 7)}
                    {ultimo.commitMessage && (
                      <span className="ml-2 font-sans text-[13px] text-text-2">{ultimo.commitMessage}</span>
                    )}
                  </>
                ) : (
                  EM_DASH
                )}
              </KeyValue>
              <KeyValue label="Quando">
                {ultimo ? (
                  <time dateTime={ultimo.createdAt} title={formatAbsolute(ultimo.createdAt)}>
                    {formatRelative(ultimo.createdAt)}
                  </time>
                ) : (
                  EM_DASH
                )}
              </KeyValue>
              <KeyValue label="Branch">{app.branch || EM_DASH}</KeyValue>
              <KeyValue label="Repositório" title={app.repository}>
                <span className="block truncate">{app.repository || EM_DASH}</span>
              </KeyValue>
            </KeyValueList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recursos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-8">
            {vivo && app.cpu != null ? (
              <Meter value={app.cpu} label="CPU" className="w-60" />
            ) : (
              <KeyValue label="CPU">{EM_DASH}</KeyValue>
            )}
            <KeyValueList>
              <KeyValue label="Memória">{vivo ? formatMB(app.memory) : EM_DASH}</KeyValue>
              <KeyValue label="Uptime">{vivo ? app.uptime || EM_DASH : EM_DASH}</KeyValue>
              <KeyValue label="CPU">{vivo ? formatPercent(app.cpu) : EM_DASH}</KeyValue>
            </KeyValueList>
          </CardContent>
        </Card>

        <UptimePanel appId={app.id} domain={app.domain} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Processo</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Runtime">{app.activeRuntime || app.runtime || EM_DASH}</KeyValue>
              <KeyValue label="Porta">{app.port}</KeyValue>
              <KeyValue label="Tipo">{app.type || EM_DASH}</KeyValue>
              <KeyValue label="Diretório" title={app.appDir}>
                <span className="block truncate">{app.appDir || '~/apps/' + app.name}</span>
              </KeyValue>
              <KeyValue label="Health">{app.healthPath || '/'}</KeyValue>
            </KeyValueList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limites</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Memória">{app.maxMemoryMb ? `${app.maxMemoryMb} MB` : 'sem limite'}</KeyValue>
              <KeyValue label="CPU">{app.cpuLimit ? String(app.cpuLimit) : 'sem limite'}</KeyValue>
            </KeyValueList>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
