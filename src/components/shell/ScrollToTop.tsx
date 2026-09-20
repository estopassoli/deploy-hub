import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Reseta a rolagem do `<main>` a cada troca de rota.
 *
 * Sem isto, abrir a página de um projeto abria já rolada até o fim, porque o painel de
 * log chama `scrollIntoView` ao montar e nada reposicionava entre rotas.
 *
 * A rolagem é do `<main>`, não do `<body>` — é o que mantém tab bar, barra de ação,
 * header de tabela e toolbar de log fixos.
 */
export function ScrollToTop({ containerRef }: { containerRef: React.RefObject<HTMLElement> }) {
  const { pathname } = useLocation();

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
  }, [pathname, containerRef]);

  return null;
}
