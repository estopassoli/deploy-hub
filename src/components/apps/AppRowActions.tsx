import { useState } from 'react';
import {
  ExternalLink,
  Gauge,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  Rocket,
  ScrollText,
  Settings2,
  Square,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BottomSheet, SheetItem, SheetSeparator } from '@/components/ds/bottom-sheet';
import { Kbd } from '@/components/ds/kbd';
import { StatusDot, statusLabel, type Status } from '@/components/ds/status';
import { useViewport } from '@/hooks/useViewport';
import { EM_DASH, formatMB, formatPercent } from '@/lib/format';
import { primaryAction } from '@/lib/app-status';
import type { FleetApp } from '@/hooks/useFleet';

/**
 * Ações de um app — menu no desktop/tablet, bottom sheet no celular.
 *
 * ## O que muda
 *
 * - **Um menu só, montado sob demanda.** Antes cada um dos 21 cards montava o próprio
 *   dropdown e os próprios modais, e cada card rodava um `setInterval` de 1s: 21
 *   re-renders por segundo com quatro overlays em cada.
 * - **Cabeçalho com o app.** Dot, status, nome, domínio, porta e recursos ficam no topo
 *   do menu, para que a ação nunca caia no app errado.
 * - **A ação de estado é contextual**: Redeploy quando running, Start quando stopped,
 *   Restart quando errored. Nunca as três juntas.
 * - **Destrutivo isolado e por último**, separado por uma régua. Antes Stop e Restart
 *   eram linhas de 32px coladas no Delete.
 * - **Navegar leva à URL do app**, não a uma página global com `<select>`: "Ver logs"
 *   abria `/versions?app=<id>` e a tela ignorava o parâmetro, selecionando o primeiro
 *   app da lista — com os botões de rollback ativos no app errado.
 */
export interface AppRowActionsProps {
  app: FleetApp;
  onLifecycle: (acao: 'start' | 'stop' | 'restart' | 'redeploy') => void;
  onDelete: () => void;
  /** `true` enquanto uma ação está em voo. */
  busy?: boolean;
}

interface Item {
  key: string;
  label: string;
  icon: React.ReactNode;
  kbd?: string;
  onSelect: () => void;
  destructive?: boolean;
  href?: string;
}

export function useAppActionItems({ app, onLifecycle, onDelete }: AppRowActionsProps) {
  const navigate = useNavigate();
  const rota = `/apps/${encodeURIComponent(app.name)}`;
  const acao = primaryAction(app.status);

  const navegar: Item[] = [
    ...(app.domain
      ? [
          {
            key: 'open',
            label: 'Abrir app',
            icon: <ExternalLink aria-hidden />,
            kbd: 'O',
            onSelect: () => window.open(`https://${app.domain}`, '_blank', 'noopener'),
          },
        ]
      : []),
    { key: 'logs', label: 'Ver logs', icon: <ScrollText aria-hidden />, kbd: 'L', onSelect: () => navigate(`${rota}/logs`) },
    { key: 'deploys', label: 'Deployments', icon: <Rocket aria-hidden />, kbd: 'D', onSelect: () => navigate(`${rota}/deployments`) },
    { key: 'env', label: 'Ambiente e build', icon: <Settings2 aria-hidden />, kbd: 'E', onSelect: () => navigate(`${rota}/env`) },
    { key: 'metrics', label: 'Métricas', icon: <Gauge aria-hidden />, kbd: 'M', onSelect: () => navigate(`${rota}?aba=metricas`) },
  ];

  const ciclo: Item[] = [
    acao === 'Redeploy'
      ? { key: 'redeploy', label: 'Redeploy', icon: <RefreshCw aria-hidden />, kbd: 'R', onSelect: () => onLifecycle('redeploy') }
      : acao === 'Start'
        ? { key: 'start', label: 'Start', icon: <Play aria-hidden />, kbd: 'S', onSelect: () => onLifecycle('start') }
        : { key: 'restart', label: 'Restart', icon: <RotateCcw aria-hidden />, kbd: '⇧R', onSelect: () => onLifecycle('restart') },
    ...(app.status === 'running'
      ? [{ key: 'stop', label: 'Stop', icon: <Square aria-hidden />, onSelect: () => onLifecycle('stop') }]
      : []),
  ];

  const destrutivo: Item[] = [
    { key: 'delete', label: 'Excluir app…', icon: <Trash2 aria-hidden />, onSelect: onDelete, destructive: true },
  ];

  return { navegar, ciclo, destrutivo, acao };
}

/** Resumo do app no topo do menu/sheet. */
function Cabecalho({ app }: { app: FleetApp }) {
  const recursos = [
    app.cpu != null ? formatPercent(app.cpu) : null,
    app.memory != null ? formatMB(app.memory) : null,
    app.uptime || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-0.5 px-2 pb-2 pt-1">
      <span className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-text-1">
        <StatusDot status={app.status} />
        <span>{statusLabel(app.status)}</span>
        <span aria-hidden className="text-text-3">·</span>
        <span className="min-w-0 truncate">{app.name}</span>
      </span>
      <span className="truncate font-mono tabular-nums text-2xs leading-4 text-text-3">
        {app.domain || EM_DASH} :{app.port}
        {recursos && ` · ${recursos}`}
      </span>
    </div>
  );
}

export function AppRowActions(props: AppRowActionsProps) {
  const viewport = useViewport();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { navegar, ciclo, destrutivo } = useAppActionItems(props);
  const { app, busy } = props;

  if (viewport === 'mobile') {
    return (
      <>
        <Button
          variant="ghost"
          size="icon-touch"
          aria-label={`Mais ações de ${app.name}`}
          aria-busy={busy ? 'true' : undefined}
          onClick={() => setSheetOpen(true)}
        >
          <MoreHorizontal aria-hidden />
        </Button>
        <BottomSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={
            <>
              <span>{app.name}</span>
              <span aria-hidden className="font-normal text-text-3">·</span>
              <StatusDot status={app.status} />
              <span className="font-medium">{statusLabel(app.status)}</span>
            </>
          }
          subtitle={`${app.domain || EM_DASH} :${app.port}`}
        >
          <div role="menu" aria-label={`Ações de ${app.name}`} className="flex flex-col">
            {[...navegar, ...ciclo].map((item) => (
              <SheetItem
                key={item.key}
                icon={item.icon}
                onSelect={() => {
                  setSheetOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </SheetItem>
            ))}
            <SheetSeparator />
            {destrutivo.map((item) => (
              <SheetItem
                key={item.key}
                icon={item.icon}
                destructive
                onSelect={() => {
                  setSheetOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </SheetItem>
            ))}
          </div>
        </BottomSheet>
      </>
    );
  }

  const tamanho = viewport === 'tablet' ? 'icon-touch' : 'icon-xs';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={tamanho}
          aria-label={`Mais ações de ${app.name} (.)`}
          aria-busy={busy ? 'true' : undefined}
          className="data-[state=open]:bg-bg-3"
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <Cabecalho app={app} />
        <DropdownMenuSeparator />
        {navegar.map((item) => (
          <DropdownMenuItem key={item.key} onSelect={item.onSelect}>
            {item.icon}
            {item.label}
            {item.kbd && viewport === 'desktop' && (
              <span className="ml-auto">
                <Kbd>{item.kbd}</Kbd>
              </span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {ciclo.map((item) => (
          <DropdownMenuItem key={item.key} onSelect={item.onSelect}>
            {item.icon}
            {item.label}
            {item.kbd && viewport === 'desktop' && (
              <span className="ml-auto">
                <Kbd>{item.kbd}</Kbd>
              </span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {destrutivo.map((item) => (
          <DropdownMenuItem key={item.key} destructive onSelect={item.onSelect}>
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
