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
    const url = new URL(window.location.href);
    url.searchParams.set('detached', '1');
    url.searchParams.set('v', Date.now().toString());
    const width = window.screen.availWidth;
    const height = window.screen.availHeight;
    const popup = window.open(url.toString(), 'deployhub-terminal', `width=${width},height=${height},left=0,top=0`);
    if (!popup) {
      toast.error('Permita pop-ups no navegador para desanexar o terminal.');
      return;
    }
    popup.opener = null;
    popup.focus();
    setHasDetachedWindow(true);
    toast.info('Terminal aberto em nova janela');
  };

  const TerminalShell = ({ standalone = false }: { standalone?: boolean }) => (
    <div
      className={cn(
        'relative flex h-full flex-col gap-6 overflow-hidden rounded-3xl border border-white/5 bg-[#050718]/80 p-4 shadow-[0_40px_120px_rgba(3,7,18,0.65)] backdrop-blur',
        standalone && 'min-h-[calc(100vh-3rem)] border-white/10 p-6 md:p-10'
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(122,162,247,0.25),_transparent_55%)]" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1a1f3d] text-[#7aa2f7]">
            <TerminalIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#818cf8]">Shell remoto</p>
            <h1 className="text-2xl font-semibold text-white">DeployHub Terminal</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-2 rounded-full px-4 py-1 text-xs font-semibold',
              isConnected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', isConnected ? 'bg-emerald-300 animate-pulse' : 'bg-rose-300')} />
            {isConnected ? 'Conectado' : 'Reconectando'}
          </div>
          {!isStandalone && (
            <Button variant="outline" size="sm" onClick={openStandaloneWindow} className="border-white/10 bg-white/5 text-white">
              <Maximize2 className="h-4 w-4" />
              <span className="ml-2 hidden md:inline">Tela cheia</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={copyOutput} className="border-white/10 bg-white/5 text-white">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="ml-2 hidden md:inline">Copiar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={clearTerminal} className="border-white/10 bg-white/5 text-white">
            <Trash2 className="h-4 w-4" />
            <span className="ml-2 hidden md:inline">Limpar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={restartTerminal} className="border-white/10 bg-white/5 text-white">
            <RefreshCw className="h-4 w-4" />
            <span className="ml-2 hidden md:inline">Reiniciar</span>
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-200">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>Cuidado! Comandos executam direto no servidor de produção.</span>
        </div>
      </div>

      <div className="flex-1 min-h-[520px] overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-[#0b1026] to-[#050716]">
        <div ref={terminalContainerRef} className="h-full w-full" />
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-[#94a3b8]">
        <span>
          <kbd className="rounded bg-white/5 px-2 py-1 text-[#7aa2f7]">Ctrl+C</kbd> interrompe comando
        </span>
        <span>
          <kbd className="rounded bg-white/5 px-2 py-1 text-[#7aa2f7]">Ctrl+L</kbd> limpa tela
        </span>
        <span>
          <kbd className="rounded bg-white/5 px-2 py-1 text-[#7aa2f7]">Tab</kbd> autocompleta
        </span>
        <span>
          <kbd className="rounded bg-white/5 px-2 py-1 text-[#7aa2f7]">↑↓</kbd> histórico
        </span>
      </div>
    </div>
  );

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-[#01030c] px-3 py-6 text-white md:px-8">
        <TerminalShell standalone />
      </div>
    );
  }

  return (
    <Layout>
      {hasDetachedWindow ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-white/5 bg-[#050718] p-8 text-center text-white">
          <TerminalIcon className="h-12 w-12 text-[#7aa2f7]" />
          <div>
            <h2 className="text-2xl font-semibold">Terminal aberto em tela cheia</h2>
            <p className="mt-2 text-sm text-white/70">
              Mantemos o terminal destacado para modo imersivo. Reabra a janela dedicada ou retorne para a versão incorporada quando quiser.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={openStandaloneWindow}>
              Reabrir nova janela
            </Button>
            <Button variant="outline" onClick={() => setHasDetachedWindow(false)}>
              Voltar ao painel
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative min-h-[calc(100vh-7rem)] bg-gradient-to-b from-[#01030c] via-[#050718] to-[#01030c] px-2 py-6 text-white md:px-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(129,140,248,0.12),transparent_55%)]" />
          <div className="relative">
            <TerminalShell />
          </div>
        </div>
      )}
    </Layout>
  );
}
