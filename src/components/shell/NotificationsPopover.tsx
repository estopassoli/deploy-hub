import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCheck, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IconButton } from '@/components/ds/icon-button';
import { LevelTag, toLevel } from '@/components/ds/level-tag';
import { EmptyState } from '@/components/ds/empty-state';
import { PANEL_TZ_LABEL, formatAbsolute, formatRelative } from '@/lib/format';
import { useNotificationHistory } from '@/hooks/useNotificationHistory';
import type { StoredNotification } from '@/lib/notificationStore';

/**
 * Caixa de notificações do sino.
 *
 * ## O que muda em relação ao painel antigo
 *
 * - **Eventos agrupados por dia**, com régua. Uma lista corrida de 50 itens não diz se
 *   a falha foi hoje de manhã ou semana passada.
 * - **Ação direta em cada falha.** Um deploy que falhou vira um link para os
 *   deployments daquele app — antes o item era só texto, e descobrir onde olhar era
 *   com o operador.
 * - **O fuso é declarado uma vez**, no rodapé.
 * - Um sino só. Havia dois sem rótulo, e o do cabeçalho pedia permissão de push em vez
 *   de abrir a caixa.
 */
function agruparPorDia(items: StoredNotification[]) {
  const grupos: { label: string; items: StoredNotification[] }[] = [];
  for (const item of items) {
    const label = formatAbsolute(item.timestamp).replace(/\s\d{2}:\d{2}$/, '');
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.label === label) ultimo.items.push(item);
    else grupos.push({ label, items: [item] });
  }
  return grupos;
}

export function NotificationsPopover({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotificationHistory();
  const navigate = useNavigate();

  const abrir = (item: StoredNotification) => {
    markAsRead(item.id);
    onOpenChange(false);
    if (item.appName) navigate(`/apps/${encodeURIComponent(item.appName)}/deployments`);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[380px] max-w-[calc(100vw-24px)] p-0">
        <div className="flex h-11 items-center gap-2 border-b border-line-1 px-3">
          <span className="text-sm font-semibold leading-5 text-text-1">Notificações</span>
          {unreadCount > 0 && (
            <span className="font-mono tabular-nums text-2xs text-text-3">{unreadCount} não lidas</span>
          )}
          <span className="flex-1" />
          <IconButton
            label="Marcar todas como lidas"
            icon={<CheckCheck />}
            disabled={unreadCount === 0}
            onClick={markAllAsRead}
          />
          <IconButton
            label="Limpar o histórico de notificações"
            icon={<Trash2 />}
            disabled={notifications.length === 0}
            onClick={clearAll}
            className="hover:text-red"
          />
        </div>

        <div className="terminal-scroll max-h-[420px] overflow-auto p-2">
          {notifications.length === 0 ? (
            <EmptyState
              title="Nada por enquanto"
              description="Deploys, quedas e alertas do servidor aparecem aqui."
              className="border-0 py-8"
            />
          ) : (
            agruparPorDia(notifications).map((grupo) => (
              <section key={grupo.label} className="flex flex-col">
                <div className="flex items-center gap-3 px-1 pb-1 pt-2 first:pt-0">
                  <span className="text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">
                    {grupo.label}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-line-1" />
                </div>
                <ul className="m-0 flex list-none flex-col p-0">
                  {grupo.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => abrir(item)}
                        className="grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-[6px] px-1 py-2 text-left transition-colors hover:bg-bg-2"
                      >
                        <span className="flex h-5 items-center">
                          <LevelTag level={toLevel(item.level)} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex items-center gap-1.5">
                            {!item.read && (
                              <span aria-hidden className="block size-1.5 shrink-0 rounded-full bg-blue" />
                            )}
                            <span className="truncate text-[13px] font-medium leading-5 text-text-1">
                              {item.title}
                            </span>
                          </span>
                          <span title={item.message} className="truncate text-xs leading-4 text-text-2">
                            {item.message}
                          </span>
                          {item.appName && (
                            <span className="flex items-center gap-1 pt-0.5 font-mono text-2xs leading-4 text-text-3">
                              {item.appName}
                              <ArrowRight className="size-3" aria-hidden />
                              deployments
                            </span>
                          )}
                        </span>
                        <time
                          dateTime={new Date(item.timestamp).toISOString()}
                          title={formatAbsolute(item.timestamp)}
                          className="whitespace-nowrap font-mono tabular-nums text-2xs leading-5 text-text-3"
                        >
                          {formatRelative(item.timestamp, { units: 1 })}
                        </time>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex h-8 items-center border-t border-line-1 px-3">
          <span className="font-mono tabular-nums text-2xs leading-4 text-text-3">{PANEL_TZ_LABEL}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
