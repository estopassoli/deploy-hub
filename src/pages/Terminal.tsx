import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal as TerminalIcon, Trash2, Copy, Check, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSocket } from '@/lib/websocket';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: Date;
}

export default function Terminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: 0, type: 'system', content: '🖥️  Terminal conectado ao servidor', timestamp: new Date() },
    { id: 1, type: 'system', content: 'Digite um comando e pressione Enter para executar.', timestamp: new Date() },
  ]);
  const [command, setCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lineIdRef = useRef(2);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input on click
  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

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
        outputLines.forEach(line => {
          if (line.trim()) {
            addLine(data.isError ? 'error' : 'output', line);
          }
        });
      }
    };

    const handleTerminalComplete = (data: { exitCode: number }) => {
      setIsExecuting(false);
      if (data.exitCode !== 0) {
        addLine('error', `Processo finalizado com código: ${data.exitCode}`);
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
    setLines(prev => [...prev, {
      id: lineIdRef.current++,
      type,
      content,
      timestamp: new Date()
    }]);
  }, []);

  const executeCommand = async () => {
    if (!command.trim() || isExecuting) return;

    const trimmedCommand = command.trim();
    
    // Add to history
    setHistory(prev => [trimmedCommand, ...prev.slice(0, 49)]);
    setHistoryIndex(-1);

    // Show input line
    addLine('input', `$ ${trimmedCommand}`);
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
    setLines([
      { id: lineIdRef.current++, type: 'system', content: '🖥️  Terminal limpo', timestamp: new Date() }
    ]);
  };

  const copyOutput = () => {
    const text = lines
      .filter(l => l.type === 'output' || l.type === 'input')
      .map(l => l.content)
      .join('\n');
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Output copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Layout>
      <div className="flex h-full flex-col gap-4 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <TerminalIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">Terminal</h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                Execute comandos diretamente no servidor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
              isConnected 
                ? "bg-success/10 text-success" 
                : "bg-destructive/10 text-destructive"
            )}>
              <div className={cn(
                "h-2 w-2 rounded-full",
                isConnected ? "bg-success animate-pulse" : "bg-destructive"
              )} />
              {isConnected ? 'Conectado' : 'Desconectado'}
            </div>
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
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>Cuidado! Você está executando comandos diretamente no servidor. Use com responsabilidade.</span>
        </div>

        {/* Terminal */}
        <div 
          ref={terminalRef}
          onClick={handleTerminalClick}
          className="flex-1 min-h-[400px] overflow-auto rounded-lg border border-border bg-[#0d1117] p-4 font-mono text-sm cursor-text"
        >
          {lines.map((line) => (
            <div 
              key={line.id} 
              className={cn(
                'py-0.5 whitespace-pre-wrap break-all',
                line.type === 'input' && 'text-cyan-400 font-semibold',
                line.type === 'output' && 'text-gray-300',
                line.type === 'error' && 'text-red-400',
                line.type === 'system' && 'text-yellow-400/70 italic'
              )}
            >
              {line.content}
            </div>
          ))}
          
          {/* Input line */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-green-400 font-semibold">$</span>
            <Input
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isExecuting}
              placeholder={isExecuting ? 'Executando...' : 'Digite um comando...'}
              className="flex-1 bg-transparent border-none text-gray-100 placeholder:text-gray-500 focus-visible:ring-0 p-0 h-auto font-mono"
            />
            {isExecuting && (
              <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            )}
          </div>
        </div>

        {/* Shortcuts */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span><kbd className="px-1.5 py-0.5 rounded bg-secondary">Enter</kbd> Executar</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-secondary">↑</kbd> <kbd className="px-1.5 py-0.5 rounded bg-secondary">↓</kbd> Histórico</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-secondary">Ctrl+C</kbd> Cancelar</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-secondary">Ctrl+L</kbd> Limpar</span>
        </div>
      </div>
    </Layout>
  );
}
