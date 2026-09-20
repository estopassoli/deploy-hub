import { Bell } from 'lucide-react';
import { forwardRef } from 'react';

/**
 * Gatilho do sino.
 *
 * O ponto de não lida é **azul**, não emerald: emerald significa só vivo, foco,
 * selecionado e aba ativa. Misturar os dois faria uma notificação parecer um estado
 * saudável.
 */
export const NotificationBell = forwardRef<
  HTMLButtonElement,
  { unread: number; touch?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ unread, touch, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={unread > 0 ? `Notificações, ${unread} não lidas` : 'Notificações'}
    className={
      touch
        ? 'grid size-11 shrink-0 place-items-center rounded-md text-text-2 transition-colors hover:bg-bg-2 hover:text-text-1 data-[state=open]:bg-bg-3'
        : 'grid size-8 shrink-0 place-items-center rounded-md text-text-2 transition-colors hover:bg-bg-2 hover:text-text-1 data-[state=open]:bg-bg-3'
    }
    {...props}
  >
    <Bell className={touch ? 'size-[18px] [grid-area:1/1]' : 'size-4 [grid-area:1/1]'} aria-hidden />
    {unread > 0 && (
      <span
        aria-hidden
        className="size-2 translate-x-1 -translate-y-1 justify-self-end self-start rounded-full border-2 border-bg-0 bg-blue [grid-area:1/1]"
      />
    )}
  </button>
));
NotificationBell.displayName = 'NotificationBell';
