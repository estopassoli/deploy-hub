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
  Filter
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { mockApps } from '@/data/mockData';
import { cn } from '@/lib/utils';

interface LogLine {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  app: string;
  message: string;
}

const generateRandomLog = (apps: string[]): LogLine => {
  const levels: LogLine['level'][] = ['info', 'warn', 'error', 'debug'];
  const messages = {
    info: [
      'Request received: GET /api/users',
      'Response sent: 200 OK',
      'Database query executed in 12ms',
      'Cache hit for key: user_session',
      'WebSocket connection established',
    ],
    warn: [
      'High memory usage: 85%',
      'Slow query detected: 450ms',
      'Rate limit approaching for IP: 192.168.1.1',
      'Deprecated API endpoint accessed',
    ],
    error: [
      'ECONNREFUSED: Database connection failed',
      'TypeError: Cannot read property of undefined',
      'JWT token expired',
      'File not found: /uploads/image.png',
    ],
    debug: [
      'Loading environment variables...',
      'Initializing middleware stack',
      'Parsing request body',
      'Validating input schema',
    ],
  };

  const level = levels[Math.floor(Math.random() * levels.length)];
  const app = apps[Math.floor(Math.random() * apps.length)];
  const messageList = messages[level];
  const message = messageList[Math.floor(Math.random() * messageList.length)];

  return {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date(),
    level,
    app,
    message,
  };
};

const levelColors = {
  info: 'text-cyan-400',
  warn: 'text-warning',
  error: 'text-destructive',
  debug: 'text-muted-foreground',
};

export default function Logs() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [selectedApp, setSelectedApp] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const appNames = mockApps.map(app => app.name);

  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const newLog = generateRandomLog(appNames);
      setLogs(prev => [...prev.slice(-200), newLog]);
    }, 800);

    return () => clearInterval(interval);
  }, [isStreaming, appNames]);

  useEffect(() => {
    if (isStreaming) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isStreaming]);

  const filteredLogs = logs.filter(log => {
    if (selectedApp !== 'all' && log.app !== selectedApp) return false;
    if (selectedLevel !== 'all' && log.level !== selectedLevel) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const clearLogs = () => setLogs([]);

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Live Logs</h1>
            <p className="mt-1 text-muted-foreground">
              Real-time log streaming from PM2 processes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant={isStreaming ? 'destructive' : 'success'}
              onClick={() => setIsStreaming(!isStreaming)}
            >
              {isStreaming ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Resume
                </>
              )}
            </Button>
            <Button variant="outline" onClick={clearLogs}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
            <Button variant="outline">
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
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedApp} onValueChange={setSelectedApp}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All apps" />
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
                <SelectValue placeholder="All levels" />
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
                {logs.length === 0 ? 'Waiting for logs...' : 'No logs match your filters'}
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="flex gap-2 py-0.5 hover:bg-secondary/30">
                  <span className="text-muted-foreground shrink-0">
                    {log.timestamp.toLocaleTimeString()}
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
