import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getSocket } from '@/lib/websocket';
import { AlertCircle, Check, Copy, Maximize2, Terminal as TerminalIcon, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: Date;
}

// Terminal content component
function TerminalContent({
  lines,
  command,
  setCommand,
  isExecuting,
  onExecute,
  onKeyDown,
  terminalRef,
  inputRef,
  isFloating = false,
}: {
  lines: TerminalLine[];
  command: string;
  setCommand: (cmd: string) => void;
  isExecuting: boolean;
  onExecute: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  terminalRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  isFloating?: boolean;
}) {
  const handleClick = () => inputRef.current?.focus();

  return (
    <div
      ref={terminalRef}
      onClick={handleClick}
      className={cn(
        "overflow-auto bg-[#1a1b26] p-4 font-mono text-sm cursor-text",
        isFloating ? "h-full" : "flex-1 min-h-[500px] rounded-lg border border-[#414868]"
      )}
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace" }}
    >
      {/* ASCII Art Header */}
      {lines.length <= 2 && (
        <pre className="text-[#7aa2f7] text-xs mb-4 leading-tight">
{`╔══════════════════════════════════════════════════════════════╗
║  ____             _             _   _       _                ║
║ |  _ \\  ___ _ __ | | ___  _   _| | | |_   _| |__             ║
║ | | | |/ _ \\ '_ \\| |/ _ \\| | | | |_| | | | | '_ \\            ║
║ | |_| |  __/ |_) | | (_) | |_| |  _  | |_| | |_) |           ║
║ |____/ \\___| .__/|_|\\___/ \\__, |_| |_|\\__,_|_.__/            ║
║            |_|            |___/                              ║
╚══════════════════════════════════════════════════════════════╝`}
        </pre>
      )}

      {lines.map((line) => (
        <div
          key={line.id}
          className={cn(
            'py-0.5 whitespace-pre-wrap break-all leading-relaxed',
            line.type === 'input' && 'text-[#7dcfff]',
            line.type === 'output' && 'text-[#a9b1d6]',
            line.type === 'error' && 'text-[#f7768e]',
            line.type === 'system' && 'text-[#9ece6a] italic'
          )}
        >
          {line.content}
        </div>
      ))}

      {/* Input Line */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[#bb9af7] font-bold select-none">root@deployhub</span>
        <span className="text-[#a9b1d6]">:</span>
        <span className="text-[#7aa2f7] font-bold">~</span>
        <span className="text-[#a9b1d6]">$</span>
        <input
          ref={inputRef}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isExecuting}
          placeholder={isExecuting ? '' : ''}
          autoFocus
          className="flex-1 bg-transparent border-none text-[#c0caf5] placeholder:text-[#565f89] focus:outline-none p-0 h-auto font-mono caret-[#7aa2f7]"
          style={{ fontFamily: 'inherit' }}
        />
        {isExecuting && (
          <span className="text-[#7aa2f7] animate-pulse">█</span>
        )}
        {!isExecuting && (
          <span className="text-[#7aa2f7] animate-[blink_1s_infinite]">█</span>
        )}
      </div>
    </div>
  );
}

export default function Terminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: 0, type: 'system', content: '● Terminal conectado ao servidor DeployHub', timestamp: new Date() },
    { id: 1, type: 'system', content: '● Digite um comando e pressione Enter para executar', timestamp: new Date() },
  ]);
  const [command, setCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [hasDetachedWindow, setHasDetachedWindow] = useState(false);
  const location = useLocation();
  const isStandalone = useMemo(() => new URLSearchParams(location.search).get('detached') === '1', [location.search]);

  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lineIdRef = useRef(2);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  // WebSocket connection for terminal
  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => {
      setIsConnected(true);
      addLine('system', '✓ Conexão WebSocket estabelecida');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      addLine('error', '✗ Conexão WebSocket perdida');
    };

    const handleTerminalOutput = (data: { output: string; isError?: boolean }) => {
      if (data.output) {
        const outputLines = data.output.split('\n');
        outputLines.forEach((line) => {
          if (line.trim()) {
            addLine(data.isError ? 'error' : 'output', line);
          }
        });
      }
    };

    const handleTerminalComplete = (data: { exitCode: number }) => {
      setIsExecuting(false);
      if (data.exitCode !== 0) {
        addLine('error', `Process exited with code: ${data.exitCode}`);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('terminal:output', handleTerminalOutput);
    socket.on('terminal:complete', handleTerminalComplete);

    if (socket.connected) {
      setIsConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('terminal:output', handleTerminalOutput);
      socket.off('terminal:complete', handleTerminalComplete);
    };
  }, []);

  const addLine = useCallback((type: TerminalLine['type'], content: string) => {
    setLines((prev) => [
      ...prev,
      {
        id: lineIdRef.current++,
        type,
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const executeCommand = async () => {
    if (!command.trim() || isExecuting) return;

    const trimmedCommand = command.trim();

    // Add to history
    setHistory((prev) => [trimmedCommand, ...prev.slice(0, 49)]);
    setHistoryIndex(-1);

    // Show input line with full prompt
    addLine('input', `root@deployhub:~$ ${trimmedCommand}`);
    setCommand('');
    setIsExecuting(true);

    // Send command via WebSocket
    const socket = getSocket();
    socket.emit('terminal:execute', { command: trimmedCommand });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setCommand(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(history[newIndex]);
      } else {
        setHistoryIndex(-1);
        setCommand('');
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      if (isExecuting) {
        const socket = getSocket();
        socket.emit('terminal:kill');
        addLine('error', '^C');
        setIsExecuting(false);
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clearTerminal();
    }
  };

  const clearTerminal = () => {
    setLines([{ id: lineIdRef.current++, type: 'system', content: '● Terminal limpo', timestamp: new Date() }]);
  };

  const copyOutput = () => {
    const text = lines
      .filter((l) => l.type === 'output' || l.type === 'input')
      .map((l) => l.content)
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Output copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const openStandaloneWindow = () => {
    if (typeof window === 'undefined') return;
    const targetUrl = `${window.location.origin}/terminal?detached=1`;
    const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer,width=1200,height=700');
    if (!popup) {
      toast.error('Permita pop-ups no navegador para desanexar o terminal.');
      return;
    }
    popup.focus();
    setHasDetachedWindow(true);
    toast.info('Terminal aberto em nova janela');
  };

  const terminalLayout = (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#7aa2f7]/10">
            <TerminalIcon className="h-5 w-5 text-[#7aa2f7]" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Terminal</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Execute comandos diretamente no servidor</p>
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
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-[#e0af68]/10 border border-[#e0af68]/20 text-[#e0af68] text-sm">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>Cuidado! Você está executando comandos diretamente no servidor. Use com responsabilidade.</span>
      </div>

      {/* Terminal */}
      <TerminalContent
        lines={lines}
        command={command}
        setCommand={setCommand}
        isExecuting={isExecuting}
        onExecute={executeCommand}
        onKeyDown={handleKeyDown}
        terminalRef={terminalRef}
        inputRef={inputRef}
      />

      {/* Shortcuts */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#24283b] text-[#7aa2f7] border border-[#414868]">Enter</kbd> Executar
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#24283b] text-[#7aa2f7] border border-[#414868]">↑</kbd>{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-[#24283b] text-[#7aa2f7] border border-[#414868]">↓</kbd> Histórico
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#24283b] text-[#7aa2f7] border border-[#414868]">Ctrl+C</kbd> Cancelar
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#24283b] text-[#7aa2f7] border border-[#414868]">Ctrl+L</kbd> Limpar
        </span>
      </div>
    </div>
  );

  const cursorStyles = (
    <style>{`
      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
    `}</style>
  );

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {terminalLayout}
        {cursorStyles}
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
        terminalLayout
      )}
      {cursorStyles}
    </Layout>
  );
}
