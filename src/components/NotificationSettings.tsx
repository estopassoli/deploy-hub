import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useNotifications } from '@/hooks/useNotifications';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface NotificationSettingsProps {
  compact?: boolean;
  className?: string;
}

export function NotificationSettings({ compact = false, className }: NotificationSettingsProps) {
  const { permission, isEnabled, isSupported, requestPermission, toggleNotifications } = useNotifications();

  const handleEnableNotifications = async () => {
    if (permission === 'denied') {
      toast.error('Notificações bloqueadas. Habilite nas configurações do navegador.');
      return;
    }

    const result = await requestPermission();
    
    if (result === 'granted') {
      toast.success('Notificações habilitadas!');
    } else if (result === 'denied') {
      toast.error('Permissão negada para notificações');
    }
  };

  if (!isSupported) {
    if (compact) return null;
    
    return (
      <div className={cn('flex items-center gap-2 text-muted-foreground text-sm', className)}>
        <BellOff className="h-4 w-4" />
        <span>Notificações não suportadas</span>
      </div>
    );
  }

  if (compact) {
    if (permission !== 'granted') {
      return (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleEnableNotifications}
          className={cn('text-muted-foreground hover:text-foreground', className)}
          title="Habilitar notificações"
        >
          <BellOff className="h-4 w-4" />
        </Button>
      );
    }

    return (
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => toggleNotifications(!isEnabled)}
        className={cn(
          isEnabled ? 'text-primary' : 'text-muted-foreground',
          className
        )}
        title={isEnabled ? 'Notificações ativas' : 'Notificações desativadas'}
      >
        {isEnabled ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      </Button>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Notificações Push</Label>
          <p className="text-xs text-muted-foreground">
            Receba alertas quando deploys falharem ou apps pararem
          </p>
        </div>
        
        {permission === 'granted' ? (
          <Switch
            checked={isEnabled}
            onCheckedChange={toggleNotifications}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableNotifications}
            className="gap-2"
          >
            <Bell className="h-4 w-4" />
            Habilitar
          </Button>
        )}
      </div>

      {permission === 'granted' && isEnabled && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 mb-2">
            <BellRing className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Notificações ativas</span>
          </div>
          <ul className="space-y-1 ml-6">
            <li>• Deploys com falha</li>
            <li>• Aplicações que pararam</li>
            <li>• Deploys concluídos</li>
          </ul>
        </div>
      )}

      {permission === 'denied' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-muted-foreground">
          <p>
            Notificações bloqueadas. Para habilitar, acesse as configurações do navegador
            e permita notificações para este site.
          </p>
        </div>
      )}
    </div>
  );
}
