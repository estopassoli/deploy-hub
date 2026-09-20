import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, WrapText } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatTime, stripAnsi } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DayRule, EmptyState, LOG_GRID, LogFooter, LogViewer, StatusDot, toLevel } from '@/components/ds';
import { LevelTag } from '@/components/ds/level-tag';
import { useApp } from './AppContext';

/**
 * Logs do app.
 *
 * O histórico é carregado **antes** de qualquer stream: `GET /logs/app/:id` já existia
 * e nenhuma tela o lia, e era por isso que a página de logs abria vazia e só ganhava
 * conteúdo se algo acontecesse enquanto ela estava aberta.
 */
export default function AppLogsTab() {
  const { app } = useApp();
  const [linhas, setLinhas] = useState<any[] | null>(null);
  const [quebrar, setQuebrar] = useState(false);

  const carregar = useCallback(async () => {
    setLinhas(null);
    try {
      setLinhas(await api.getAppLogs(app.id, 200));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar os logs');
      setLinhas([]);
    }
  }, [app.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  let diaAtual = '';

  return (
    <LogViewer
      label={`Logs de ${app.name}`}
      toolbar={
        <>
          <span className="flex items-center gap-2">
            <span className="font-mono tabular-nums text-xs leading-4 text-text-1">{app.name}</span>
            <span className="flex items-center gap-[5px]">
              <StatusDot status={app.status === 'running' ? 'running' : 'stopped'} size={6} />
              <span className="font-mono tabular-nums text-2xs leading-4 text-text-3">
                {app.activeRuntime || 'pm2'}
              </span>
            </span>
          </span>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-pressed={quebrar}
            aria-label="Quebrar linhas (W)"
            onClick={() => setQuebrar((v) => !v)}
            className={cn(quebrar && 'bg-bg-3 text-text-1')}
          >
            <WrapText aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Atualizar" onClick={carregar}>
            <RefreshCw aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Baixar log"
            onClick={() => {
              const texto = (linhas ?? []).map((l) => stripAnsi(l.message)).join('\n');
              const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = `${app.name}.log`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download aria-hidden />
          </Button>
        </>
      }
      footer={<LogFooter summary={`${linhas?.length ?? 0} linhas`} keys={false} />}
      className="h-[min(640px,70vh)]"
    >
      {linhas === null ? (
        <div className="flex flex-col gap-1 p-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <EmptyState
          title="Nenhuma linha de log"
          description="O painel guarda o que o processo escreveu desde o último deploy."
          className="m-3 border-0"
        />
      ) : (
        linhas.map((linha, i) => {
          const dia = (linha.createdAt || '').slice(0, 10);
          const mostraRegua = dia && dia !== diaAtual;
          if (mostraRegua) diaAtual = dia;
          return (
            <div key={linha.id ?? i}>
              {mostraRegua && <DayRule iso={dia} label={dia} />}
              <div className={cn('grid min-h-5 items-start gap-x-3 px-3', LOG_GRID)}>
                <span className="whitespace-nowrap font-mono tabular-nums text-[12.5px] leading-5 text-text-3">
                  {formatTime(linha.createdAt)}
                </span>
                <span className="flex h-5 items-center">
                  <LevelTag level={toLevel(linha.level)} />
                </span>
                <span className="truncate font-mono tabular-nums text-[12.5px] leading-5 text-text-2 max-md:hidden">
                  {linha.source || app.name}
                </span>
                <span
                  title={stripAnsi(linha.message)}
                  className={cn(
                    'font-mono tabular-nums text-[12.5px] leading-5 text-text-1',
                    quebrar ? 'whitespace-pre-wrap break-words' : 'truncate',
                  )}
                >
                  {stripAnsi(linha.message)}
                </span>
              </div>
            </div>
          );
        })
      )}
    </LogViewer>
  );
}
