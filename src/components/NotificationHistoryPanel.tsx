import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Bell,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Trash2,
  CheckCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useNotificationHistory } from '@/hooks/useNotificationHistory';
import { StoredNotification, NotificationLevel } from '@/lib/notificationStore';
import { cn } from '@/lib/utils';

const levelIcons: Record<NotificationLevel, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const levelColors: Record<NotificationLevel, string> = {
  success: 'text-success',
  error: 'text-destructive',
  warning: 'text-warning',
  info: 'text-primary',
};

const levelBgColors: Record<NotificationLevel, string> = {
  success: 'bg-success/10',
  error: 'bg-destructive/10',
  warning: 'bg-warning/10',
  info: 'bg-primary/10',
};

interface NotificationItemProps {
  notification: StoredNotification;
  onMarkAsRead: (id: string) => void;
}

function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  const Icon = levelIcons[notification.level];
  
  return (
    <div
      className={cn(
        'relative flex gap-3 p-3 rounded-lg border transition-colors',
        notification.read 
          ? 'bg-background border-border/50 opacity-70' 
          : 'bg-secondary/50 border-border'
      )}
    >
      <div className={cn('p-2 rounded-full h-fit', levelBgColors[notification.level])}>
        <Icon className={cn('h-4 w-4', levelColors[notification.level])} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm text-foreground">{notification.title}</p>
          {!notification.read && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onMarkAsRead(notification.id)}
              className="h-6 w-6 flex-shrink-0"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        
        <div className="flex items-center gap-2 mt-2">
          {notification.appName && (
            <Badge variant="outline" className="text-xs py-0 h-5">
              {notification.appName}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(notification.timestamp, { 
              addSuffix: true, 
              locale: ptBR 
            })}
          </span>
        </div>
      </div>
      
      {!notification.read && (
        <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary animate-pulse" />
      )}
    </div>
  );
}

interface NotificationHistoryPanelProps {
  compact?: boolean;
}

export function NotificationHistoryPanel({ compact }: NotificationHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotificationHistory();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size={compact ? 'icon-sm' : 'icon'} className="relative">
          <Bell className={cn('h-4 w-4', compact && 'h-4 w-4')} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      
      <SheetContent className="w-full sm:max-w-md p-0">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificações
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {unreadCount} novas
                </Badge>
              )}
            </SheetTitle>
          </div>
        </SheetHeader>
        
        {notifications.length > 0 && (
          <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border bg-secondary/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="h-7 text-xs"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Marcar todas como lidas
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-7 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Limpar
            </Button>
          </div>
        )}
        
        <ScrollArea className="h-[calc(100vh-120px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="p-4 rounded-full bg-secondary/50 mb-4">
                <Bell className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Nenhuma notificação</p>
              <p className="text-xs text-muted-foreground mt-1">
                Alertas de deploy e sistema aparecerão aqui
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
