import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Boxes, Play, RefreshCw, ScrollText, SquareTerminal } from 'lucide-react';
import api from '@/lib/api';
import { useViewport } from '@/hooks/useViewport';
import { useKeyboardMap } from '@/hooks/useKeyboardMap';
import { useNotifications } from '@/hooks/useNotifications';
import { useNotificationHistory } from '@/hooks/useNotificationHistory';
import { useFleet } from '@/hooks/useFleet';
import { CommandPalette, type PaletteItem } from '@/components/ds/command-palette';
import { FleetProvider } from './FleetContext';
import { SidebarDesktop } from './SidebarDesktop';
import { RailTablet } from './RailTablet';
import { TabBarMobile } from './TabBarMobile';
import { TopBar } from './TopBar';
import { MoreSheet } from './MoreSheet';
import { NotificationBell } from './NotificationBell';
import { NotificationsPopover } from './NotificationsPopover';
import { ShortcutsDialog } from './ShortcutsDialog';
import { ScrollToTop } from './ScrollToTop';
import { useCrumbs } from './Breadcrumb';

/**
 * O shell. **Uma layout route, montada uma vez.**
 *
 * Antes, onze páginas importavam `<Layout>` e o shell remontava a cada navegação: a
 * sidebar refazia fetch, o scroll se perdia e cada página desenhava o próprio
 * cabeçalho do seu jeito.
 *
 * ## Seis decisões embutidas
 *
 * 1. **Uma árvore só.** Sidebar, rail e tab bar são três `<nav>` diferentes; montar os
 *    três com `hidden` criaria três landmarks de navegação no mesmo documento e o
 *    leitor de tela anunciaria os três. Monta-se exatamente um.
 * 2. **`h-viewport` + `overflow-y-auto` no `<main>`:** a rolagem é do conteúdo, não do
 *    `<body>`. É o que mantém tab bar, header de tabela e toolbar de log fixos, e o
 *    que dá ao terminal uma altura real.
 * 3. **`@container` no `<main>`:** o conteúdo responde à largura que tem, não à da
 *    tela. Numa janela de 1100px o shell é de desktop e a tabela é a de tablet — cada
 *    peça responde ao espaço disponível, sem truncar identificador.
 * 4. **`min-w-0` no wrapper:** sem isso um filho de grid com conteúdo largo empurra o
 *    container. Era a causa raiz dos 96px de rolagem horizontal no celular.
 * 5. **`overflow-x-clip`, não `hidden`:** `hidden` cria um contexto de rolagem e quebra
 *    `position: sticky` nos filhos; `clip` corta sem criar scroll container.
 * 6. **Paleta e sheets montadas aqui**, não nas páginas: estado global, um atalho, um
 *    overlay por vez.
 */
export function AppShell() {
  const viewport = useViewport();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useNotifications();
  const { unreadCount } = useNotificationHistory();
  const fleet = useFleet();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [stats, setStats] = useState<{ cpuUsage: number; memoryUsage: number; diskUsage: number } | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  const serverName = import.meta.env.VITE_SERVER_NAME || 'servidor';
  const crumbs = useCrumbs(serverName);

  // Saúde e uso do servidor, com repique. "online" passa a ser dado: antes era um
  // texto fixo com pulso que dizia "Server Online" mesmo com a API fora.
  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      try {
        const [s] = await Promise.all([api.getStats()]);
        if (!vivo) return;
        setStats({ cpuUsage: s.cpuUsage, memoryUsage: s.memoryUsage, diskUsage: s.diskUsage });
        setOnline(true);
      } catch {
        if (vivo) setOnline(false);
      }
    };
    ler();
    const t = setInterval(ler, 30_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  // Título da aba por rota. Era sempre "DeployHub - DevOps Management Panel".
  useEffect(() => {
    document.title = `${crumbs[crumbs.length - 1]?.label ?? 'DeployHub'} · DeployHub`;
  }, [crumbs]);

  const abrirBusca = useCallback(() => {
    if (viewport === 'mobile') navigate('/buscar');
    else setPaletteOpen(true);
  }, [viewport, navigate]);

  useKeyboardMap({
    enabled: viewport === 'desktop',
    onPalette: () => setPaletteOpen((v) => !v),
    bindings: useMemo(
      () => ({
        n: () => navigate('/new'),
        '?': () => setShortcutsOpen(true),
        'g v': () => navigate('/'),
        'g d': () => navigate('/deployments'),
        'g l': () => navigate('/logs'),
        'g t': () => navigate('/terminal'),
      }),
      [navigate],
    ),
  });

  const paletteItems: PaletteItem[] = useMemo(() => {
    const apps: PaletteItem[] = fleet.apps.map((app) => ({
      id: `app-${app.id}`,
      group: 'Apps',
      label: app.name,
      status: app.status,
      detail: [app.domain, app.port ? `:${app.port}` : null].filter(Boolean).join(' '),
      keywords: app.branch ?? '',
      onSelect: () => navigate(`/apps/${encodeURIComponent(app.name)}`),
    }));

    const projetos: PaletteItem[] = fleet.groups
      .filter((g) => g.projectId)
      .map((g) => ({
        id: `proj-${g.id}`,
        group: 'Projetos',
        label: g.name,
        icon: <Boxes className="size-4 text-text-3" aria-hidden />,
        detail: `${g.apps.length} services`,
        onSelect: () => navigate(`/projects/${g.projectId}`),
      }));

    const acoes: PaletteItem[] = [
      {
        id: 'act-new',
        group: 'Ações',
        label: 'Novo deploy',
        icon: <Play className="size-4 text-text-3" aria-hidden />,
        onSelect: () => navigate('/new'),
      },
      {
        id: 'act-deployments',
        group: 'Ir para',
        label: 'Deployments',
        icon: <RefreshCw className="size-4 text-text-3" aria-hidden />,
        onSelect: () => navigate('/deployments'),
      },
      {
        id: 'act-logs',
        group: 'Ir para',
        label: 'Logs',
        icon: <ScrollText className="size-4 text-text-3" aria-hidden />,
        onSelect: () => navigate('/logs'),
      },
      {
        id: 'act-terminal',
        group: 'Ir para',
        label: 'Terminal',
        icon: <SquareTerminal className="size-4 text-text-3" aria-hidden />,
        onSelect: () => navigate('/terminal'),
      },
    ];

    return [...apps, ...projetos, ...acoes];
  }, [fleet.apps, fleet.groups, navigate]);

  // Fecha overlays ao trocar de rota: um overlay aberto sobre uma tela nova é ruído.
  useEffect(() => {
    setMoreOpen(false);
    setBellOpen(false);
  }, [pathname]);

  const bell = (
    <NotificationsPopover open={bellOpen} onOpenChange={setBellOpen}>
      <NotificationBell unread={unreadCount} touch={viewport !== 'desktop'} />
    </NotificationsPopover>
  );

  return (
    <FleetProvider value={fleet}>
      <div className="flex h-viewport overflow-x-clip bg-bg-0 text-text-1">
        {viewport === 'desktop' && (
          <SidebarDesktop
            serverName={serverName}
            groups={fleet.groups}
            stats={stats}
            onSearch={abrirBusca}
            onShortcuts={() => setShortcutsOpen(true)}
          />
        )}
        {viewport === 'tablet' && (
          <RailTablet groups={fleet.groups} onSearch={abrirBusca} onShortcuts={() => setShortcutsOpen(true)} />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar viewport={viewport} serverName={serverName} online={online} bell={bell} onSearch={abrirBusca} />

          <main
            ref={mainRef}
            className="@container min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-6 max-xl:px-4 max-md:px-4 max-md:py-4"
          >
            <ScrollToTop containerRef={mainRef} />
            <Outlet />
          </main>

          {viewport === 'mobile' && <TabBarMobile onMore={() => setMoreOpen(true)} />}
        </div>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />
        <MoreSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          serverName={serverName}
          online={online}
          projectCount={fleet.groups.filter((g) => g.projectId).length}
          stats={stats}
        />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </div>
    </FleetProvider>
  );
}
