import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, Search, Trash2, WrapText } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { cn } from '@/lib/utils';
import { formatTime, stripAnsi } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Callout,
  DayRule,
  EmptyState,
  LOG_GRID,
  LevelTag,
  LogFooter,
  LogViewer,
  PageHeader,
  StatusDot,
  toLevel,
  type Level,
} from '@/components/ds';
import { useFleetContext } from '@/components/shell/FleetContext';

/**
 * Logs do sistema.
 *
 * ## Dois defeitos que esta tela tinha
 *
 * 1. **Abria vazia.** O stream do socket era a única fonte: `GET /logs` existia na API
 *    e nenhuma tela o lia. Quem abrisse a página fora de um deploy via uma caixa preta
 *    e concluía que não havia log nenhum. Aqui o histórico carrega primeiro, o socket
 *    só continua de onde ele parou.
 * 2. **O filtro por app não filtrava.** Toda linha chegava do gateway com
 *    `app: 'system'`, então o `<select>` de app não tinha o que casar. O filtro
 *    continua aqui porque o histórico do banco **tem** origem por linha — mas o aviso
 *    diz que o stream ao vivo ainda não etiqueta, para que ninguém confie num filtro
 *    que só funciona pela metade.
 */
interface Linha {
  id: string;
  at: string;
  level: Level;
  source: string;
  message: string;
  /** Linha que chegou pelo socket, sem etiqueta de origem confiável. */
  live?: boolean;
}

const NIVEIS: { id: 'todos' | Level; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'ERROR', label: 'Error' },
  { id: 'WARN', label: 'Warn' },
  { id: 'INFO', label: 'Info' },
];

export default function Logs() {
  const fleet = useFleetContext();

  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [seguindo, setSeguindo] = useState(true);
  const [quebrar, setQuebrar] = useState(false);
  const [nivel, setNivel] = useState<'todos' | Level>('todos');
  const [app, setApp] = useState('todos');
  const [busca, setBusca] = useState('');
  const fimRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const historico = await api.getSystemLogs({ limit: 300 });
      setLinhas(
        (historico ?? []).map((l: any) => ({
          id: l.id,
          at: l.createdAt,
          level: toLevel(l.level),
          source: l.source || l.app?.name || 'sistema',
          message: stripAnsi(l.message),
        })),
      );
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar o histórico');
      setLinhas([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!seguindo) return;
    wsClient.connect().catch(() => undefined);

    const onLog = (dado: any) => {
      const nova: Linha = {
        id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: dado.timestamp || new Date().toISOString(),
        level: toLevel(dado.level),
        source: dado.app || 'sistema',
        // O `pm2 logs` repassa a saída crua dos apps, com as sequências ANSI dentro.
        message: stripAnsi(typeof dado.message === 'string' ? dado.message : String(dado.message ?? dado)),
        live: true,
      };
      setLinhas((atual) => [...(atual ?? []).slice(-400), nova]);
    };

    wsClient.on('log', onLog);
    wsClient.on('pm2:log', onLog);
    return () => {
      wsClient.off('log', onLog);
      wsClient.off('pm2:log', onLog);
    };
  }, [seguindo]);

  useEffect(() => {
    if (seguindo) fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [linhas, seguindo]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (linhas ?? []).filter((l) => {
      if (nivel !== 'todos' && l.level !== nivel) return false;
      if (app !== 'todos' && l.source !== app) return false;
      if (termo && !l.message.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [linhas, nivel, app, busca]);

  const origensAoVivo = (linhas ?? []).some((l) => l.live && l.source === 'sistema');

  let diaAtual = '';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Logs"
        meta={
          <>
            <span className="flex items-center gap-1.5">
              <StatusDot status={seguindo ? 'running' : 'stopped'} size={6} />
              <span>{seguindo ? 'seguindo' : 'pausado'}</span>
            </span>
            <span aria-hidden>·</span>
            <span>{visiveis.length} de {linhas?.length ?? 0} linhas</span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setSeguindo((v) => !v)}>
              {seguindo ? <Pause aria-hidden /> : <Play aria-hidden />}
              {seguindo ? 'Pausar' : 'Seguir'}
            </Button>
            <Button variant="ghost" onClick={() => setLinhas([])}>
              <Trash2 aria-hidden />
              Limpar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const texto = visiveis
                  .map((l) => `${l.at} [${l.level}] [${l.source}] ${l.message}`)
                  .join('\n');
                const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = `logs-${new Date().toISOString().slice(0, 10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download aria-hidden />
              Baixar
            </Button>
          </>
        }
      />

      {erro && (
        <Callout
          tone="red"
          title="Não foi possível carregar o histórico"
          action={
            <Button variant="secondary" size="xs" onClick={carregar}>
              Tentar de novo
            </Button>
          }
        >
          {erro}
        </Callout>
      )}

      {!erro && origensAoVivo && (
        <Callout tone="blue" title="O stream ao vivo não etiqueta a origem">
          As linhas que chegam pelo socket vêm todas como <span className="font-mono">sistema</span>,
          porque o gateway do servidor não marca de qual app veio cada linha. O filtro por app vale
          para o histórico; para o tempo real de um app específico, use a aba Logs dele.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filtrar por nível" className="flex items-center gap-1 rounded-md border border-line-2 bg-bg-1 p-0.5">
          {NIVEIS.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-pressed={nivel === n.id}
              onClick={() => setNivel(n.id)}
              className={cn(
                'flex h-7 items-center rounded-[4px] px-2.5 text-xs font-medium transition-colors max-xl:h-10',
                nivel === n.id ? 'bg-bg-3 text-text-1' : 'text-text-2 hover:text-text-1',
              )}
            >
              {n.label}
            </button>
          ))}
        </div>

        <select
          value={app}
          onChange={(e) => setApp(e.target.value)}
          aria-label="Filtrar por origem"
          className="flex h-8 min-w-40 items-center rounded-[6px] border border-line-2 bg-bg-1 px-2.5 text-[13px] text-text-1 max-xl:h-12 max-xl:text-[16px]"
        >
          <option value="todos">Todas as origens</option>
          <option value="sistema">sistema</option>
          {fleet.apps.map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>

        <div className="relative min-w-52 max-w-80 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-3" aria-hidden />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no texto"
            aria-label="Buscar nos logs"
            className="pl-8"
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-pressed={quebrar}
          aria-label="Quebrar linhas"
          onClick={() => setQuebrar((v) => !v)}
          className={cn(quebrar && 'bg-bg-3 text-text-1')}
        >
          <WrapText aria-hidden />
        </Button>
      </div>

      <LogViewer
        label="Logs do sistema"
        footer={<LogFooter summary={`${visiveis.length} linhas · ${seguindo ? 'seguindo' : 'pausado'}`} keys={false} />}
        className="h-[min(640px,66vh)]"
      >
        {linhas === null ? (
          <div className="flex flex-col gap-1 p-3">
            {Array.from({ length: 14 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <EmptyState
            title={linhas.length === 0 ? 'Nenhum log registrado' : 'Nada com esse filtro'}
            description={
              linhas.length === 0
                ? 'Eventos do servidor e saída dos apps aparecem aqui.'
                : 'Ajuste o nível, a origem ou a busca.'
            }
            className="m-3 border-0"
          />
        ) : (
          <>
            {visiveis.map((linha) => {
              const dia = (linha.at || '').slice(0, 10);
              const mostraRegua = Boolean(dia) && dia !== diaAtual;
              if (mostraRegua) diaAtual = dia;
              return (
                <div key={linha.id}>
                  {mostraRegua && <DayRule iso={dia} label={dia} />}
                  <div className={cn('grid min-h-5 items-start gap-x-3 px-3', LOG_GRID)}>
                    <span className="whitespace-nowrap font-mono tabular-nums text-[12.5px] leading-5 text-text-3">
                      {formatTime(linha.at)}
                    </span>
                    <span className="flex h-5 items-center">
                      <LevelTag level={linha.level} />
                    </span>
                    <span className="truncate font-mono tabular-nums text-[12.5px] leading-5 text-text-2 max-md:hidden">
                      {linha.source}
                    </span>
                    <span
                      title={linha.message}
                      className={cn(
                        'font-mono tabular-nums text-[12.5px] leading-5 text-text-1',
                        quebrar ? 'whitespace-pre-wrap break-words' : 'truncate',
                      )}
                    >
                      {linha.message}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={fimRef} />
          </>
        )}
      </LogViewer>
    </div>
  );
}
