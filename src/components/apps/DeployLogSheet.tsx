import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Check, CircleDashed, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { formatDuration, formatTime, stripAnsi } from '@/lib/format';
import { getConnectedSocket } from '@/lib/websocket';
import { toast } from 'sonner';

/**
 * Painel lateral com o log do deploy ao vivo e o progresso por fase.
 *
 * ## Por que um Sheet e não um modal
 *
 * O log de deploy aparecia num `Dialog` centralizado que bloqueava a tela inteira: para
 * olhar qualquer outra coisa do painel — o status dos outros apps, por exemplo — era
 * preciso fechar e perder o stream. Um painel lateral deixa o Dashboard visível ao lado.
 *
 * ## As fases
 *
 * O backend já marcava a fase de cada linha de log (`cloning`, `installing`, ...) e essa
 * informação só era usada para colorir texto. Aqui ela vira uma lista com check, spinner
 * e o tempo de cada etapa — que é o que responde "por que esse deploy está demorando".
 */

/** Ordem canônica das fases do pipeline, como o backend as emite. */
const PHASES: Array<{ key: string; label: string }> = [
  { key: 'cloning', label: 'Clonando repositório' },
  { key: 'installing', label: 'Instalando dependências' },
  { key: 'migrating', label: 'Migrations' },
  { key: 'building', label: 'Build' },
  { key: 'starting', label: 'Subindo o app' },
  { key: 'configuring', label: 'Nginx e SSL' },
  { key: 'health-check', label: 'Health check' },
  { key: 'rollback', label: 'Rollback automático' },
];

interface DeployLogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chave do stream: nome do app, ou do PROJETO quando for service de monorepo. */
  deployKey: string;
  title?: string;
  /** Chamado quando o deploy termina, para a tela recarregar os dados. */
  onFinished?: (success: boolean) => void;
}

interface LogLine {
  id: number;
  message: string;
  phase?: string;
  at: Date;
}

export function DeployLogSheet({ open, onOpenChange, deployKey, title, onFinished }: DeployLogSheetProps) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [phaseTimes, setPhaseTimes] = useState<Record<string, { start: number; end?: number }>>({});
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [finished, setFinished] = useState<null | { success: boolean; error?: string }>(null);
  const [cancelling, setCancelling] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  useEffect(() => {
    if (!open || !deployKey) return;

    let active = true;
    let cleanup: (() => void) | null = null;

    setLines([]);
    setPhaseTimes({});
    setCurrentPhase(null);
    setFinished(null);

    const subscribe = async () => {
      const socket = await getConnectedSocket();
      if (!active) return;

      const onLog = (data: { appName: string; message: string; phase?: string }) => {
        if (data.appName !== deployKey) return;

        setLines((prev) => [
          ...prev.slice(-500),
          { id: counter.current++, message: stripAnsi(data.message), phase: data.phase, at: new Date() },
        ]);

        if (data.phase) {
          setCurrentPhase((prevPhase) => {
            if (prevPhase !== data.phase) {
              const agora = Date.now();
              setPhaseTimes((prev) => {
                const next = { ...prev };
                if (prevPhase && next[prevPhase] && !next[prevPhase].end) {
                  next[prevPhase] = { ...next[prevPhase], end: agora };
                }
                if (!next[data.phase!]) next[data.phase!] = { start: agora };
                return next;
              });
            }
            return data.phase!;
          });
        }
      };

      const onComplete = (data: { appName: string; success: boolean; error?: string }) => {
        if (data.appName !== deployKey) return;
        const agora = Date.now();
        setPhaseTimes((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (!next[key].end) next[key] = { ...next[key], end: agora };
          }
          return next;
        });
        setFinished({ success: data.success, error: data.error });
        onFinished?.(data.success);
      };

      socket.on('deploy:log', onLog);
      socket.on('deploy:complete', onComplete);
      socket.emit('subscribe-deploy', { appName: deployKey });

      cleanup = () => {
        socket.off('deploy:log', onLog);
        socket.off('deploy:complete', onComplete);
        socket.emit('unsubscribe-deploy');
      };
    };

    subscribe().catch(() => {
      toast.error('Não foi possível acompanhar o log do deploy');
    });

    return () => {
      active = false;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deployKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  /** Só as fases que este deploy realmente passou (um app estático pula várias). */
  const visiblePhases = useMemo(
    () => PHASES.filter((phase) => phaseTimes[phase.key] || phase.key === currentPhase),
    [phaseTimes, currentPhase],
  );

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.cancelDeploy(deployKey);
      toast.info('Cancelamento solicitado — encerrando a etapa atual...');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível cancelar');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {finished ? (
              finished.success ? (
                <Check className="h-5 w-5 text-success" />
              ) : (
                <X className="h-5 w-5 text-destructive" />
              )
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {title ?? `Deploy de ${deployKey}`}
          </SheetTitle>
          <SheetDescription>
            {finished
              ? finished.success
                ? 'Deploy concluído com sucesso.'
                : `Deploy falhou: ${finished.error ?? 'veja o log abaixo'}`
              : 'Acompanhando em tempo real. Você pode continuar usando o painel.'}
          </SheetDescription>
        </SheetHeader>

        {/* Progresso por fase */}
        {visiblePhases.length > 0 && (
          <div className="space-y-1 rounded-lg border border-border bg-card p-3">
            {visiblePhases.map((phase) => {
              const tempo = phaseTimes[phase.key];
              const emAndamento = currentPhase === phase.key && !finished;
              const concluida = tempo?.end !== undefined;

              return (
                <div key={phase.key} className="flex items-center gap-2 text-sm">
                  {emAndamento ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : concluida ? (
                    <Check className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn('flex-1', emAndamento ? 'text-foreground' : 'text-muted-foreground')}>
                    {phase.label}
                  </span>
                  {tempo && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDuration((tempo.end ?? Date.now()) - tempo.start)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Log */}
        <div className="flex-1 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs terminal-scroll">
          {lines.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Aguardando o log...</p>
          ) : (
            lines.map((line) => (
              <div key={line.id} className="flex gap-2 py-0.5">
                <span className="shrink-0 text-muted-foreground">{formatTime(line.at)}</span>
                <span
                  className={cn(
                    'break-all',
                    /*
                     * Estes prefixos vêm do BACKEND, que ainda emite emoji nas linhas
                     * de deploy. O kit não usa emoji como vocabulário — nível é
                     * LevelTag. Enquanto o servidor não parar de emitir, a detecção
                     * aqui é o que dá cor à linha; remover isto sem mudar o backend
                     * deixaria a saída monocromática.
                     */
                    line.message.startsWith('✓') && 'text-success',
                    line.message.startsWith('▶') && 'text-primary',
                    line.message.startsWith('🚀') && 'font-bold text-primary',
                    line.message.startsWith('❌') && 'font-bold text-destructive',
                    line.message.startsWith('⛔') && 'text-muted-foreground',
                    line.message.includes('⚠') && 'text-warning',
                  )}
                >
                  {line.message || ' '}
                </span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <div className="flex justify-end gap-2">
          {!finished && (
            <Button
              variant="secondary"
              className="text-destructive hover:text-destructive"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Cancelar deploy
            </Button>
          )}
          <Button variant={finished?.success ? 'primary' : 'secondary'} onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
