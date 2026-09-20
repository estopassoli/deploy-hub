import { ChevronLeft, Plus, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ds/kbd';
import { StatusDot } from '@/components/ds/status';
import { HubMark } from './HubMark';
import { Breadcrumb, useCrumbs } from './Breadcrumb';
import type { Viewport } from '@/hooks/useViewport';

/**
 * Barra superior: 52px no desktop, 56px no toque.
 *
 * ## Três regras fáceis de errar
 *
 * 1. **O ponto de não lida é azul**, não emerald. Emerald significa só vivo, foco,
 *    selecionado e aba ativa.
 * 2. **"online" é dado.** Era texto fixo com `animate-pulse` na sidebar — dizia
 *    "Server Online" mesmo com a API fora. Aqui vem de `GET /system/health`.
 * 3. **Um primário por view.** "Novo deploy" é o primário do shell, então ele
 *    desaparece dentro do próprio fluxo `/new` — senão haveria dois botões claros
 *    competindo na mesma tela.
 */
export function TopBar({
  viewport,
  serverName,
  online,
  bell,
  onSearch,
}: {
  viewport: Viewport;
  serverName: string;
  online: boolean | null;
  /** O sino já embrulhado no seu popover — ver `NotificationsPopover`. */
  bell: React.ReactNode;
  onSearch: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const crumbs = useCrumbs(serverName);

  const noFluxoNovo = pathname.startsWith('/new');
  const ehDetalhe = pathname.split('/').filter(Boolean).length > 1;

  if (viewport === 'mobile') {
    return (
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line-1 bg-bg-0 px-2">
        {ehDetalhe ? (
          <Button variant="ghost" size="icon-touch" aria-label="Voltar" onClick={() => navigate(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-strong text-bg-0">
            <HubMark className="size-5" />
          </span>
        )}
        {/* O título do top bar não é heading: o `h1` é da página. */}
        <span className="min-w-0 flex-1 truncate text-base font-semibold leading-6 text-text-1">
          {crumbs[crumbs.length - 1]?.label}
        </span>
        <Button variant="ghost" size="icon-touch" aria-label="Buscar" onClick={onSearch}>
          <Search aria-hidden />
        </Button>
        {bell}
      </header>
    );
  }

  return (
    <header
      className={cnHeader(viewport)}
    >
      <Breadcrumb serverName={serverName} />
      <div className="flex-1" />

      <span className="flex items-center gap-2 whitespace-nowrap font-mono text-xs tabular-nums text-text-2">
        <StatusDot status={online === null ? 'building' : online ? 'running' : 'errored'} />
        {online === null ? 'verificando' : online ? 'online' : 'sem resposta'}
      </span>

      <span aria-hidden className="h-4 w-px shrink-0 bg-line-2" />

      {bell}

      {!noFluxoNovo && (
        <Button
          variant="primary"
          size={viewport === 'tablet' ? 'touch' : 'default'}
          withKbd={viewport === 'desktop'}
          onClick={() => navigate('/new')}
        >
          <Plus aria-hidden />
          Novo deploy
          {viewport === 'desktop' && <Kbd tone="on-primary">N</Kbd>}
        </Button>
      )}
    </header>
  );
}

function cnHeader(viewport: Viewport) {
  return viewport === 'tablet'
    ? 'flex h-14 shrink-0 items-center gap-4 border-b border-line-1 px-4'
    : 'flex h-13 shrink-0 items-center gap-4 border-b border-line-1 px-8';
}
