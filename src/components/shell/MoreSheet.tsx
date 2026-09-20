import { Boxes, ChevronRight, Github, LogOut, ScrollText, Settings, ShieldCheck, SquareTerminal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet, SheetItem, SheetSeparator } from '@/components/ds/bottom-sheet';
import { StatusDot } from '@/components/ds/status';
import { EM_DASH, formatPercent } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { CRIT_AT, WARN_AT } from '@/components/ds/meter';
import { cn } from '@/lib/utils';

/**
 * Sheet "Mais" do celular.
 *
 * Recebe o que não cabe nas cinco abas: projetos, terminal, auditoria, Git e CI,
 * configurações e sair. É onde também vive a saúde do servidor, já com a palavra
 * `alto` ao lado do número quando passa de 70% — cor não é sinal.
 *
 * "Git e CI" não tem tela global: leva para a busca, onde escolher um app abre
 * `/apps/:name/git`. O `<select>` global que existia era um seletor de contexto
 * paralelo à URL, e é a origem de toda uma classe de bug de deep-link.
 */
export function MoreSheet({
  open,
  onOpenChange,
  serverName,
  online,
  projectCount,
  stats,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverName: string;
  online: boolean | null;
  projectCount: number;
  stats?: { cpuUsage?: number; memoryUsage?: number; diskUsage?: number } | null;
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const ir = (to: string) => () => {
    onOpenChange(false);
    navigate(to);
  };

  const medida = (rotulo: string, valor?: number) => {
    const tem = typeof valor === 'number' && Number.isFinite(valor);
    const alto = tem && valor >= WARN_AT;
    return (
      <span key={rotulo} className="flex items-baseline gap-1">
        <span className="text-text-3">{rotulo}</span>
        <span className="text-text-2">{tem ? formatPercent(valor, 0) : EM_DASH}</span>
        {alto && (
          <span className={cn('font-medium', valor >= CRIT_AT ? 'text-red' : 'text-amber')}>alto</span>
        )}
      </span>
    );
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={user?.name || 'Administrador'}
      subtitle={user?.email}
    >
      <div className="flex items-center gap-2 rounded-[8px] bg-bg-2 px-3 py-2 font-mono text-[13px] tabular-nums">
        <StatusDot status={online === null ? 'building' : online ? 'running' : 'errored'} />
        <span className="truncate text-text-1">{serverName}</span>
        <span aria-hidden className="text-text-3">·</span>
        <span className="flex flex-wrap items-baseline gap-x-2.5">
          {medida('CPU', stats?.cpuUsage)}
          {medida('MEM', stats?.memoryUsage)}
          {medida('DISK', stats?.diskUsage)}
        </span>
      </div>

      <div role="menu" aria-label="Mais" className="flex flex-col pt-2">
        <SheetItem icon={<Boxes />} onSelect={ir('/')}>
          Projetos
          <span className="ml-auto flex items-center gap-1 font-mono text-[13px] tabular-nums text-text-3">
            {projectCount}
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </SheetItem>
        <SheetItem icon={<SquareTerminal />} onSelect={ir('/terminal')}>
          Terminal
        </SheetItem>
        <SheetItem icon={<Github />} onSelect={ir('/buscar?modo=git')}>
          Git e CI
        </SheetItem>
        <SheetItem icon={<ScrollText />} onSelect={ir('/logs')}>
          Logs
        </SheetItem>
        <SheetItem icon={<ShieldCheck />} onSelect={ir('/audit')}>
          Auditoria
        </SheetItem>
        <SheetItem icon={<Settings />} onSelect={ir('/settings')}>
          Configurações
        </SheetItem>

        <SheetSeparator />

        <SheetItem icon={<LogOut />} destructive onSelect={logout}>
          Sair
        </SheetItem>
      </div>
    </BottomSheet>
  );
}
