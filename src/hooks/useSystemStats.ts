import { useEffect, useState } from 'react';
import api from '@/lib/api';

export interface SystemStats {
  totalApps: number;
  runningApps: number;
  stoppedApps: number;
  totalDeploys: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

/**
 * Uso do servidor, com repique de 30s.
 *
 * `stale` existe para que a tela possa dizer **"sem atualizar há 2 min · tentando"** em
 * vez de seguir rotulando dados velhos como atuais: a falha de polling era silenciosa
 * e o painel continuava dizendo "atualizado há menos de um minuto".
 */
export function useSystemStats() {
  const [data, setData] = useState<SystemStats | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      try {
        const s = await api.getStats();
        if (!vivo) return;
        setData(s);
        setUpdatedAt(Date.now());
        setStale(false);
      } catch {
        if (vivo) setStale(true);
      }
    };
    ler();
    const t = setInterval(ler, 30_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  return { data, updatedAt, stale };
}
