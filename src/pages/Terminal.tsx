import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal as TerminalIcon, Trash2, Copy, Check, AlertCircle, Maximize2, Minimize2, X, Minus } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { getSocket } from '@/lib/websocket';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: Date;
}

// Floating terminal window component
function FloatingTerminal({
  children,
  onClose,
  onMinimize,
}: {
  children: React.ReactNode;
  onClose: () => void;
  onMinimize: () => void;
}) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [prevState, setPrevState] = useState({ position: { x: 100, y: 100 }, size: { width: 800, height: 500 } });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMaximized) return;
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: Math.max(0, e.clientX - dragOffset.x),
          y: Math.max(0, e.clientY - dragOffset.y),
        });
      }
      if (isResizing && windowRef.current) {
        const newWidth = Math.max(400, e.clientX - position.x);
        const newHeight = Math.max(300, e.clientY - position.y);
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, position]);

  const toggleMaximize = () => {
    if (isMaximized) {
      setPosition(prevState.position);
      setSize(prevState.size);
    } else {
      setPrevState({ position, size });
      setPosition({ x: 0, y: 0 });
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    setIsMaximized(!isMaximized);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
      <div
        ref={windowRef}
        className="absolute bg-[#1a1b26] rounded-lg overflow-hidden shadow-2xl border border-[#414868] flex flex-col"
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
        }}
      >
        {/* Window Title Bar */}
        <div
          className="flex items-center justify-between px-4 py-2 bg-[#16161e] cursor-move select-none border-b border-[#414868]"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors flex items-center justify-center group"
              >
                <X className="w-2 h-2 text-[#990000] opacity-0 group-hover:opacity-100" />
              </button>
              <button
                onClick={onMinimize}
                className="w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e]/80 transition-colors flex items-center justify-center group"
              >
                <Minus className="w-2 h-2 text-[#995700] opacity-0 group-hover:opacity-100" />
              </button>
              <button
                onClick={toggleMaximize}
                className="w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840]/80 transition-colors flex items-center justify-center group"
              >
                <Maximize2 className="w-2 h-2 text-[#006500] opacity-0 group-hover:opacity-100" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[#787c99] text-sm">
              <TerminalIcon className="w-4 h-4" />
              <span className="font-medium">root@deployhub ~ </span>
            </div>
          </div>
        </div>

        {/* Terminal Content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>

        {/* Resize Handle */}
        {!isMaximized && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={handleResizeMouseDown}
          >
            <svg className="w-4 h-4 text-[#414868]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
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
  const [isDetached, setIsDetached] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

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

  // Minimized floating button
  if (isDetached && isMinimized) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Terminal está em modo flutuante minimizado</p>
            <Button onClick={() => setIsMinimized(false)}>
              <Maximize2 className="h-4 w-4 mr-2" />
              Restaurar Terminal
            </Button>
          </div>
        </div>
        <button
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-[#1a1b26] border border-[#414868] rounded-lg shadow-xl hover:bg-[#24283b] transition-colors"
        >
          <TerminalIcon className="h-5 w-5 text-[#7aa2f7]" />
          <span className="text-[#a9b1d6] font-medium">Terminal</span>
        </button>
      </Layout>
    );
  }

  // Floating/Detached terminal
  if (isDetached) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Terminal está em modo flutuante</p>
            <Button onClick={() => setIsDetached(false)}>
              <Minimize2 className="h-4 w-4 mr-2" />
              Anexar Terminal
            </Button>
          </div>
        </div>
        <FloatingTerminal onClose={() => setIsDetached(false)} onMinimize={() => setIsMinimized(true)}>
          <TerminalContent
            lines={lines}
            command={command}
            setCommand={setCommand}
            isExecuting={isExecuting}
            onExecute={executeCommand}
            onKeyDown={handleKeyDown}
            terminalRef={terminalRef}
            inputRef={inputRef}
            isFloating
          />
        </FloatingTerminal>
      </Layout>
    );
  }

  return (
    <Layout>
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
            <Button variant="outline" size="sm" onClick={() => setIsDetached(true)}>
              <Maximize2 className="h-4 w-4" />
              <span className="hidden md:inline ml-2">Desanexar</span>
            </Button>
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

      {/* Blink animation for cursor */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </Layout>
  );
}
