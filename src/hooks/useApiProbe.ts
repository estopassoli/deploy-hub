import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

/**
 * A API está no ar, e em quanto tempo responde?
 *
 * Usado na tela de login, que não tem sessão. A sondagem bate num endpoint protegido
 * **de propósito**: um 401 é resposta — prova que o servidor está de pé e mede a
 * latência sem precisar de credencial. O que distingue "no ar" de "fora" aqui é ter
 * havido resposta HTTP, não o código dela.
 *
 * Substitui o "Server Online" que era texto fixo com um pulso, e que continuava
 * dizendo "online" com o backend derrubado.
 */
export type EstadoApi = 'verificando' | 'ok' | 'falhou';

export function useApiProbe() {
  const [estado, setEstado] = useState<EstadoApi>('verificando');
  const [latencia, setLatencia] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;

    const sondar = async () => {
      const inicio = performance.now();
      try {
        await fetch(`${API_URL.replace(/\/$/, '')}/system/health`, { method: 'GET', cache: 'no-store' });
        if (!vivo) return;
        setLatencia(Math.round(performance.now() - inicio));
        setEstado('ok');
      } catch {
        // Só falha de rede chega aqui; qualquer status HTTP resolve o fetch.
        if (!vivo) return;
        setLatencia(null);
        setEstado('falhou');
      }
    };

    sondar();
    const t = setInterval(sondar, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  return { estado, latencia };
}
