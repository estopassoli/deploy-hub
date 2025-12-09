import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getConnectedSocket } from '@/lib/websocket';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { AlertCircle, Check, Copy, Maximize2, RefreshCw, Terminal as TerminalIcon, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';

export default function Terminal() {
  const [isConnected, setIsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasDetachedWindow, setHasDetachedWindow] = useState(false);
  const location = useLocation();
  const isStandalone = useMemo(() => new URLSearchParams(location.search).get('detached') === '1', [location.search]);

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if ((hasDetachedWindow && !isStandalone) || !terminalContainerRef.current) {
      return;
    }

    let mounted = true;
    let cleanup: (() => void) | null = null;

    const init = async () => {
      const container = terminalContainerRef.current;
      if (!container) return;

      const socket = await getConnectedSocket();
      if (!mounted) return;

      const terminal = new XTerm({
        allowTransparency: true,
        cursorBlink: true,
        fontFamily: 'JetBrains Mono, Fira Code, SFMono-Regular, Consolas, monospace',
        fontSize: 14,
        theme: {
          background: '#1a1b26',
          foreground: '#c0caf5',
          cursor: '#7aa2f7',
          cursorAccent: '#1a1b26',
          black: '#1a1b26',
          brightBlack: '#414868',
        },
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);
      fitAddon.fit();
      terminal.focus();

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      socketRef.current = socket;

      const updateSize = () => {
        if (!socketRef.current || !terminalRef.current || !fitAddonRef.current) return;
        fitAddonRef.current.fit();
        socketRef.current.emit('terminal:resize', {
          cols: terminalRef.current.cols,
          rows: terminalRef.current.rows,
        });
      };

      const resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(container);
      window.addEventListener('resize', updateSize);

      const handleData = (chunk: string) => terminal.write(chunk);
      const handleExit = ({ exitCode }: { exitCode: number }) => terminal.writeln(`\r\nProcesso finalizado (code: ${exitCode})\r\n`);
      const handleError = (message: string) => terminal.writeln(`\r\n[erro] ${message}\r\n`);
      const handleConnect = () => setIsConnected(true);
      const handleDisconnect = () => setIsConnected(false);

      socket.on('terminal:data', handleData);
      socket.on('terminal:exit', handleExit);
      socket.on('terminal:error', handleError);
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      if (socket.connected) {
        handleConnect();
      }

      terminal.onData((data) => socket.emit('terminal:input', { data }));

      socket.emit('terminal:init', { cols: terminal.cols, rows: terminal.rows });

      cleanup = () => {
        resizeObserver.disconnect();
        window.removeEventListener('resize', updateSize);
        terminal.dispose();
        socket.off('terminal:data', handleData);
        socket.off('terminal:exit', handleExit);
        socket.off('terminal:error', handleError);
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.emit('terminal:kill');
        if (terminalRef.current === terminal) {
          terminalRef.current = null;
        }
        if (fitAddonRef.current === fitAddon) {
          fitAddonRef.current = null;
        }
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
      };
    };

    init();

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [hasDetachedWindow, isStandalone]);

  const copyOutput = () => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    let text = terminal.getSelection();
    if (!text) {
      const buffer: string[] = [];
      const length = terminal.buffer.active.length;
      for (let i = 0; i < length; i++) {
        buffer.push(terminal.buffer.active.getLine(i)?.translateToString(true) ?? '');
      }
      text = buffer.join('\n').trim();
    }

    if (!text) {
      toast.error('Nada para copiar');
      return;
    }

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Conteúdo copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const clearTerminal = () => {
    terminalRef.current?.clear();
  };

  const restartTerminal = () => {
    const socket = socketRef.current;
    const terminal = terminalRef.current;
    if (!socket || !terminal) return;
    terminal.reset();
    socket.emit('terminal:kill');
    socket.emit('terminal:init', { cols: terminal.cols, rows: terminal.rows });
    terminal.focus();
  };

  const openStandaloneWindow = () => {
    if (typeof window === 'undefined') return;
    const popup = window.open(`${window.location.origin}/terminal?detached=1`, '_blank', 'noopener,noreferrer,width=1200,height=700');
    if (!popup) {
      toast.error('Permita pop-ups no navegador para desanexar o terminal.');
      return;
    }
    popup.focus();
    setHasDetachedWindow(true);
    toast.info('Terminal aberto em nova janela');
  };

  const renderTerminalShell = () => (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#7aa2f7]/10">
            <TerminalIcon className="h-5 w-5 text-[#7aa2f7]" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Terminal</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Shell interativo conectado ao servidor</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
              isConnected ? 'bg-[#9ece6a]/10 text-[#9ece6a]' : 'bg-[#f7768e]/10 text-[#f7768e]'
            )}
          >
            <div className={cn('h-2 w-2 rounded-full', isConnected ? 'bg-[#9ece6a] animate-pulse' : 'bg-[#f7768e]')} />
            {isConnected ? 'Conectado' : 'Desconectado'}
          </div>
          {!isStandalone && (
            <Button variant="outline" size="sm" onClick={openStandaloneWindow}>
              <Maximize2 className="h-4 w-4" />
              <span className="hidden md:inline ml-2">Desanexar</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={copyOutput}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="hidden md:inline ml-2">Copiar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={clearTerminal}>
            <Trash2 className="h-4 w-4" />
            <span className="hidden md:inline ml-2">Limpar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={restartTerminal}>
            <RefreshCw className="h-4 w-4" />
            <span className="hidden md:inline ml-2">Reiniciar</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-[#e0af68]/10 border border-[#e0af68]/20 text-[#e0af68] text-sm">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>Cuidado! Você está executando comandos diretamente no servidor. Use com responsabilidade.</span>
      </div>

      <div className="flex-1 min-h-[500px] overflow-hidden rounded-lg border border-[#414868] bg-[#1a1b26]">
        <div ref={terminalContainerRef} className="h-full w-full" />
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#24283b] text-[#7aa2f7] border border-[#414868]">Ctrl+C</kbd> Interrompe comando
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#24283b] text-[#7aa2f7] border border-[#414868]">Ctrl+L</kbd> Limpa tela
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#24283b] text-[#7aa2f7] border border-[#414868]">Tab</kbd> Autocompleta caminho/comando
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#24283b] text-[#7aa2f7] border border-[#414868]">↑↓</kbd> Histórico de comandos
        </span>
      </div>
    </div>
  );

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {renderTerminalShell()}
      </div>
    );
  }

  return (
    <Layout>
      {hasDetachedWindow ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <TerminalIcon className="h-12 w-12 text-[#7aa2f7]" />
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Terminal aberto em nova janela</h2>
            <p className="mt-2 text-muted-foreground max-w-md">
              Mantemos o terminal destacado para você trabalhar em tela cheia. Caso precise reabrir ou voltar ao modo incorporado, use as opções abaixo.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={openStandaloneWindow}>
              Reabrir janela do terminal
            </Button>
            <Button variant="outline" onClick={() => setHasDetachedWindow(false)}>
              Usar terminal incorporado
            </Button>
          </div>
        </div>
      ) : (
        renderTerminalShell()
      )}
    </Layout>
  );
}
