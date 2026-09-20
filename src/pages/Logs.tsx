import { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Play,
  Pause,
  Trash2,
  Download,
  Search,
  Filter,
  Loader2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatTime, stripAnsi } from '@/lib/format';
import { LogLinesSkeleton } from '@/components/Skeletons';
import api from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { toast } from 'sonner';
import { App } from '@/types/app';

interface LogLine {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  app: string;
  message: string;
}

const levelColors = {
  info: 'text-cyan-400',
  warn: 'text-warning',
  error: 'text-destructive',
  debug: 'text-muted-foreground',
};

export default function Logs() {
  const [apps, setApps] = useState<App[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [selectedApp, setSelectedApp] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    if (isStreaming) {
      wsClient.connect().catch(() => {});
      
      const handleLog = (logData: any) => {
        const newLog: LogLine = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date(logData.timestamp || Date.now()),
          level: logData.level || 'info',
          app: logData.app || 'system',
          // O `pm2 logs` repassa a saída crua dos apps, com as sequências de cor ANSI
          // dentro. Sem isto, aparecia `\u001b[32m✓\u001b[39m` na tela.
          message: stripAnsi(typeof logData.message === 'string' ? logData.message : String(logData.message ?? logData)),
        };
        setLogs(prev => [...prev.slice(-200), newLog]);
      };

      wsClient.on('log', handleLog);
      wsClient.on('pm2:log', handleLog);

      return () => {
        wsClient.off('log', handleLog);
        wsClient.off('pm2:log', handleLog);
      };
    }
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isStreaming]);

  const loadApps = async () => {
    try {
      const data = await api.getApps();
      setApps(data);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar apps');
    } finally {
      setIsLoading(false);
    }
  };

  const appNames = apps.map(app => app.name);

  const filteredLogs = logs.filter(log => {
    if (selectedApp !== 'all' && log.app !== selectedApp) return false;
    if (selectedLevel !== 'all' && log.level !== selectedLevel) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const clearLogs = () => setLogs([]);

  const exportLogs = () => {
    const content = filteredLogs.map(log => 
      `${log.timestamp.toISOString()} [${log.level.toUpperCase()}] [${log.app}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[calc(100vh-8rem)] flex-col">
          <div className="mb-4 h-9 w-56 animate-pulse rounded bg-secondary" />
          <div className="flex-1 overflow-hidden rounded-xl border border-border bg-background">
            <LogLinesSkeleton linhas={16} />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Logs ao vivo</h1>
            <p className="mt-1 text-muted-foreground">
              Real-time log streaming from PM2 processes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant={isStreaming ? 'destructive' : 'default'}
              onClick={() => setIsStreaming(!isStreaming)}
            >
              {isStreaming ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pausar
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Retomar
                </>
              )}
            </Button>
            <Button variant="outline" onClick={clearLogs}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
            <Button variant="outline" onClick={exportLogs}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar nos logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedApp} onValueChange={setSelectedApp}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos os apps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Apps</SelectItem>
                {appNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Todos os níveis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <div className={cn('h-2 w-2 rounded-full', isStreaming ? 'bg-success animate-pulse' : 'bg-muted-foreground')} />
            {isStreaming ? 'Streaming' : 'Paused'}
            <span>·</span>
            <span>{filteredLogs.length} logs</span>
          </div>
        </div>

        {/* Terminal */}
        <div className="flex-1 rounded-xl border border-border bg-background overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-destructive/80" />
              <div className="h-3 w-3 rounded-full bg-warning/80" />
              <div className="h-3 w-3 rounded-full bg-success/80" />
            </div>
            <span className="ml-2 text-xs text-muted-foreground font-mono">
              pm2 logs --raw
            </span>
          </div>
          <div className="h-full overflow-auto p-4 font-mono text-sm terminal-scroll">
            {filteredLogs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {logs.length === 0 ? 'Aguardando logs...' : 'Nenhum log corresponde aos filtros'}
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="flex gap-2 py-0.5 hover:bg-secondary/30">
                  <span className="text-muted-foreground shrink-0">
                    {/* Fuso fixo do painel: `toLocaleTimeString()` usava o fuso de
                        quem estava olhando, o que dava 01:13 na coluna e 04:13 na
                        própria mensagem do log. */}
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={cn('shrink-0 font-semibold uppercase w-12', levelColors[log.level])}>
                    [{log.level.slice(0, 4)}]
                  </span>
                  <span className="text-primary/80 shrink-0">
                    [{log.app}]
                  </span>
                  <span className="text-foreground/90 break-all">
                    {log.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
