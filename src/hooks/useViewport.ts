import { useSyncExternalStore } from 'react';
import { DESKTOP_MIN, TABLET_MIN } from '@/lib/breakpoints';

/**
 * Viewport do **shell** em três estados.
 *
 * Substitui `use-mobile.tsx`, que tinha um defeito real: `useState<boolean|undefined>`
 * + `useEffect` faz o primeiro render devolver `undefined`, ou seja, um frame com o
 * chrome errado antes de corrigir.
 *
 * Isto é usado só onde CSS não resolve, e são três casos — todos de **comportamento**:
 *
 * 1. Qual primitivo de overlay montar (menu ancorado vs. bottom sheet vs. sheet
 *    lateral): são componentes diferentes; renderizar os dois e esconder um com
 *    `hidden` duplica DOM, nomes acessíveis e listeners.
 * 2. Qual chrome de navegação montar: sidebar, rail e tab bar são três `<nav>` com
 *    conteúdo diferente. Renderizar os três criaria três landmarks de navegação no
 *    mesmo documento, e o leitor de tela anunciaria os três.
 * 3. Teclado: o handler global e as dicas de tecla só existem no desktop.
 *
 * Para **layout**, use CSS: uma árvore só, sem JS, sem flash na primeira pintura.
 */
export type Viewport = 'mobile' | 'tablet' | 'desktop';

const QUERIES = {
  tablet: `(min-width: ${TABLET_MIN}px)`,
  desktop: `(min-width: ${DESKTOP_MIN}px)`,
} as const;

function read(): Viewport {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia(QUERIES.desktop).matches) return 'desktop';
  if (window.matchMedia(QUERIES.tablet).matches) return 'tablet';
  return 'mobile';
}

function subscribe(cb: () => void) {
  const mqls = Object.values(QUERIES).map((q) => window.matchMedia(q));
  mqls.forEach((m) => m.addEventListener('change', cb));
  return () => mqls.forEach((m) => m.removeEventListener('change', cb));
}

export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, read, () => 'desktop');
}
