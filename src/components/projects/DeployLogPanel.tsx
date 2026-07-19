import { useEffect, useRef, useState } from 'react';
import { getConnectedSocket } from '@/lib/websocket';

interface Props {
  projectName: string;
}

/** Live deploy log stream. Project and per-service deploys both publish on the project name key. */
export function DeployLogPanel({ projectName }: Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    let socket: Awaited<ReturnType<typeof getConnectedSocket>> | null = null;
    let cancelled = false;

    const onLog = (d: { appName: string; message: string }) => {
      if (d.appName === projectName) setLogs((prev) => [...prev, d.message]);
    };
    const onComplete = (d: { appName: string; success: boolean; error?: string }) => {
      if (d.appName !== projectName) return;
      setLogs((prev) => [...prev, d.success ? '🚀 Concluído' : `❌ Falhou: ${d.error || 'erro desconhecido'}`]);
    };

    getConnectedSocket().then((s) => {
      if (cancelled) return;
      socket = s;
      s.on('deploy:log', onLog);
      s.on('deploy:complete', onComplete);
      s.emit('subscribe-deploy', { appName: projectName });
    });

    return () => {
      cancelled = true;
      if (socket) {
        socket.off('deploy:log', onLog);
        socket.off('deploy:complete', onComplete);
        socket.emit('unsubscribe-deploy');
      }
    };
  }, [projectName]);

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <span className="text-xs font-mono text-muted-foreground">deploy --project {projectName}</span>
        {logs.length > 0 && (
          <button onClick={() => setLogs([])} className="text-xs text-muted-foreground hover:text-foreground">
            limpar
          </button>
        )}
      </div>
      <div className="h-[280px] overflow-auto p-4 font-mono text-sm terminal-scroll">
        {logs.length === 0 ? (
          <div className="text-muted-foreground">Aguardando um deploy...</div>
        ) : (
          logs.map((l, i) => (
            <div key={i} className="py-0.5 text-foreground/90 break-all">
              {l}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
