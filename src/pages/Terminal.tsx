import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Kbd } from '@/components/ds/kbd';
import { Callout } from '@/components/ds/callout';
import { StatusDot } from '@/components/ds/status';
import { getConnectedSocket } from '@/lib/websocket';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { AlertCircle, Check, Copy, RefreshCw, Terminal as TerminalIcon, Trash2 } from 'lucide-react';
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

      // O xterm não lê variáveis CSS, então os tokens do kit entram como hex aqui —
      // é a única exceção à regra de "nenhum hex literal". O tema Tokyo Night que
      // estava aqui era uma quarta paleta solta dentro do produto.
      const terminal = new XTerm({
        allowTransparency: true,
        cursorBlink: true,
        fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        theme: {
          background: '#0A0A0B', // --bg-0
          foreground: '#EDEDEF', // --text-1
          cursor: '#3DD68C', // --brand
          cursorAccent: '#0A0A0B',
          black: '#0A0A0B',
          brightBlack: '#3F3F46', // --line-3
          red: '#FF6369', // --errored
          green: '#3DD68C', // --running
          yellow: '#FFB224', // --building
          blue: '#70B8FF', // --info
          magenta: '#BAA7FF', // --docker
          white: '#B4B4BB', // --text-2
          brightWhite: '#EDEDEF',
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

      // O backend passou a exigir JWT no handshake: sem token válido a conexão é
      // recusada e o terminal ficaria mudo. Mostra o motivo em vez de travar.
      const handleConnectError = (err: Error) => {
        setIsConnected(false);
        if (err?.message === 'unauthorized') {
          terminal.writeln('\r\n[erro] Sessão expirada ou não autenticada. Faça login novamente.\r\n');
        }
      };

      socket.on('terminal:data', handleData);
      socket.on('terminal:exit', handleExit);
      socket.on('terminal:error', handleError);
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('connect_error', handleConnectError);

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
        socket.off('connect_error', handleConnectError);
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

    init().catch((err) => {
      console.warn('Terminal: failed to initialize WebSocket session:', err);
      toast.error(
        err?.message === 'unauthorized'
          ? 'Sessão expirada — faça login novamente para usar o terminal'
          : 'Não foi possível conectar ao terminal',
      );
    });

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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-start gap-4 max-md:flex-col max-md:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="m-0 text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">Terminal</h1>
          <p className="m-0 flex items-center gap-2 text-[13px] leading-5 text-text-3">
            <span className="flex items-center gap-1.5">
              <StatusDot status={isConnected ? 'running' : 'errored'} />
              <span className={isConnected ? '' : 'font-medium text-red'}>
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </span>
            <span aria-hidden>·</span>
            <span>shell interativo no servidor</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:flex-wrap">
          <Button variant="secondary" onClick={copyOutput}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            Copiar
          </Button>
          <Button variant="secondary" onClick={clearTerminal}>
            <Trash2 aria-hidden />
            Limpar
          </Button>
          <Button variant="secondary" onClick={restartTerminal}>
            <RefreshCw aria-hidden />
            Reiniciar
          </Button>
        </div>
      </header>

      <Callout tone="amber" title="Comandos rodam direto no servidor, como root">
        Não há confirmação nem desfazer aqui. O mesmo shell que faz deploy apaga arquivos.
      </Callout>

      {/*
        O terminal ocupa a altura que sobra do shell — `min-h-0` no pai é o que permite
        isso sem empurrar a página. Antes era `min-h-[500px]`, que no tablet estourava a
        largura e jogava o botão "Reiniciar" para fora da tela.
      */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-[8px] border border-line-2 bg-bg-0 p-3">
        <div ref={terminalContainerRef} className="h-full w-full" />
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-text-3 max-xl:hidden">
        <span className="flex items-center gap-1.5">
          <Kbd>Ctrl+C</Kbd> interrompe o comando
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Ctrl+L</Kbd> limpa a tela
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Tab</Kbd> autocompleta
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↑↓</Kbd> histórico
        </span>
      </div>
    </div>
  );

  if (isStandalone) {
    return (
      <div className="h-viewport bg-bg-0 p-3 text-text-1">
        {renderTerminalShell()}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      {hasDetachedWindow ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <TerminalIcon className="h-8 w-8 text-text-3" aria-hidden />
          <div>
            <h2 className="m-0 text-base font-semibold leading-6 text-text-1">Terminal aberto em nova janela</h2>
            <p className="m-0 mt-2 max-w-md text-[13px] leading-5 text-text-2">
              Mantemos o terminal destacado para você trabalhar em tela cheia. Caso precise reabrir ou voltar ao modo incorporado, use as opções abaixo.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={openStandaloneWindow}>
              Reabrir janela do terminal
            </Button>
            <Button variant="secondary" onClick={() => setHasDetachedWindow(false)}>
              Usar terminal incorporado
            </Button>
          </div>
        </div>
      ) : (
        renderTerminalShell()
      )}
    </div>
  );
}
