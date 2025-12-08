import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';

interface AppMetricsChartProps {
  appId: string;
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MetricData {
  cpu: number;
  memory: number;
  time: string;
}

export function AppMetricsChart({ appId, appName, open, onOpenChange }: AppMetricsChartProps) {
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hours, setHours] = useState('1');

  useEffect(() => {
    if (open) {
      loadMetrics();
    }
  }, [open, hours, appId]);

  const loadMetrics = async () => {
    try {
      setIsLoading(true);
      const data = await api.getAppMetrics(appId, parseInt(hours, 10));
      // Format time for display
      const formatted = data.map((m) => ({
        ...m,
        displayTime: new Date(m.time).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }));
      setMetrics(formatted);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const avgCpu = metrics.length > 0 
    ? Math.round(metrics.reduce((sum, m) => sum + m.cpu, 0) / metrics.length) 
    : 0;
  const avgMemory = metrics.length > 0 
    ? Math.round(metrics.reduce((sum, m) => sum + m.memory, 0) / metrics.length) 
    : 0;
  const maxCpu = metrics.length > 0 ? Math.max(...metrics.map(m => m.cpu)) : 0;
  const maxMemory = metrics.length > 0 ? Math.max(...metrics.map(m => m.memory)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="truncate">Métricas - {appName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Histórico de uso de CPU e memória
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-primary" />
              <span className="text-muted-foreground">CPU</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-cyan-400" />
              <span className="text-muted-foreground">Memória</span>
            </div>
          </div>
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 hora</SelectItem>
              <SelectItem value="6">6 horas</SelectItem>
              <SelectItem value="12">12 horas</SelectItem>
              <SelectItem value="24">24 horas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-xs text-muted-foreground">CPU Média</p>
            <p className="text-lg font-semibold text-primary">{avgCpu}%</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-xs text-muted-foreground">CPU Máx</p>
            <p className="text-lg font-semibold text-primary">{Math.round(maxCpu)}%</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-xs text-muted-foreground">Memória Média</p>
            <p className="text-lg font-semibold text-cyan-400">{avgMemory}MB</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-xs text-muted-foreground">Memória Máx</p>
            <p className="text-lg font-semibold text-cyan-400">{Math.round(maxMemory)}MB</p>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 min-h-[250px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : metrics.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <TrendingUp className="h-12 w-12 mb-2 opacity-50" />
              <p>Nenhuma métrica disponível</p>
              <p className="text-xs">As métricas são coletadas a cada 30 segundos</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  dataKey="displayTime" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number, name: string) => [
                    name === 'cpu' ? `${value.toFixed(1)}%` : `${value}MB`,
                    name === 'cpu' ? 'CPU' : 'Memória'
                  ]}
                />
                <Line 
                  type="monotone" 
                  dataKey="cpu" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="memory" 
                  stroke="#22d3ee" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#22d3ee' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
