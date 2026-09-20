import { useEffect, useState } from 'react';
import { Bell, Check, Loader2, Save, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';

/**
 * Canais de notificação e quais eventos disparam cada um.
 *
 * Antes havia um único campo "Slack Webhook URL" que não salvava em lugar nenhum, e um
 * backend que não enviava nada para o Slack. Agora são quatro canais de verdade.
 *
 * As credenciais **não** voltam do servidor: um webhook do Slack é um segredo — quem
 * tem a URL posta no canal — e o token do Telegram controla o bot inteiro. A tela mostra
 * apenas se o canal está configurado; digitar um valor novo substitui, e o botão
 * Remover limpa.
 */

const EVENTOS: Array<{ key: string; label: string; description: string }> = [
  { key: 'notifyDeployFailed', label: 'Deploy falhou', description: 'Erro em qualquer etapa do pipeline' },
  { key: 'notifyRollback', label: 'Rollback automático', description: 'O health check reprovou e o app voltou' },
  { key: 'notifyAppDown', label: 'Aplicação caiu', description: 'Processo ou container saiu sem ter sido parado' },
  { key: 'notifySslExpiring', label: 'SSL expirando', description: 'Certificado a menos de 14 dias do vencimento' },
  { key: 'notifyDeploySuccess', label: 'Deploy concluído', description: 'Também avisa quando dá certo' },
];

export function NotificationChannels() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Campos de credencial começam vazios: o servidor não devolve os valores.
  const [credenciais, setCredenciais] = useState({
    slackWebhook: '',
    discordWebhook: '',
    telegramBotToken: '',
    telegramChatId: '',
  });

  useEffect(() => {
    api
      .getNotificationSettings()
      .then(setSettings)
      .catch(() => toast.error('Erro ao carregar configurações de notificação'))
      .finally(() => setLoading(false));
  }, []);

  const salvar = async () => {
    setSaving(true);
    try {
      // Só manda a credencial que foi efetivamente digitada: um campo intocado não
      // pode virar `''` e apagar o canal sem querer.
      const payload: Record<string, unknown> = {};
      for (const [campo, valor] of Object.entries(credenciais)) {
        if (valor !== '') payload[campo] = valor;
      }
      for (const evento of EVENTOS) {
        payload[evento.key] = settings[evento.key];
      }

      setSettings(await api.updateNotificationSettings(payload));
      setCredenciais({ slackWebhook: '', discordWebhook: '', telegramBotToken: '', telegramChatId: '' });
      toast.success('Notificações salvas');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const limparCanal = async (campos: string[], nome: string) => {
    setSaving(true);
    try {
      setSettings(await api.updateNotificationSettings(Object.fromEntries(campos.map((c) => [c, '']))));
      toast.success(`${nome} removido`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao remover');
    } finally {
      setSaving(false);
    }
  };

  const testar = async () => {
    setTesting(true);
    try {
      const { results, message } = await api.testNotifications();
      if (message) {
        toast.info(message);
        return;
      }
      const falhas = results.filter((r) => !r.ok);
      if (falhas.length === 0) {
        toast.success(`Mensagem de teste enviada para ${results.length} canal(is)`);
      } else {
        toast.error(falhas.map((f) => `${f.channel}: ${f.error}`).join(' · '), { duration: 12000 });
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao testar');
    } finally {
      setTesting(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Canal
        nome="Slack"
        configurado={settings.slackConfigured}
        placeholder="https://hooks.slack.com/services/..."
        valor={credenciais.slackWebhook}
        onChange={(v) => setCredenciais({ ...credenciais, slackWebhook: v })}
        onRemover={() => limparCanal(['slackWebhook'], 'Slack')}
        ajuda="Crie um Incoming Webhook no app do Slack e cole a URL aqui."
        disabled={saving}
      />

      <Canal
        nome="Discord"
        configurado={settings.discordConfigured}
        placeholder="https://discord.com/api/webhooks/..."
        valor={credenciais.discordWebhook}
        onChange={(v) => setCredenciais({ ...credenciais, discordWebhook: v })}
        onRemover={() => limparCanal(['discordWebhook'], 'Discord')}
        ajuda="Configurações do canal → Integrações → Webhooks → Novo webhook."
        disabled={saving}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Telegram</Label>
          <StatusCanal configurado={settings.telegramConfigured} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={credenciais.telegramBotToken}
            onChange={(e) => setCredenciais({ ...credenciais, telegramBotToken: e.target.value })}
            placeholder={settings.telegramConfigured ? '•••••• (token salvo)' : '123456:ABC-DEF...'}
            className="font-mono text-sm"
            disabled={saving}
          />
          <Input
            value={credenciais.telegramChatId}
            onChange={(e) => setCredenciais({ ...credenciais, telegramChatId: e.target.value })}
            placeholder={settings.telegramConfigured ? '•••••• (chat salvo)' : '-1001234567890'}
            className="font-mono text-sm"
            disabled={saving}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Token do @BotFather e o id do chat. Grupo tem id negativo.
          </p>
          {settings.telegramConfigured && (
            <Button
             
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={saving}
              onClick={() => limparCanal(['telegramBotToken', 'telegramChatId'], 'Telegram')}
            >
              Remover
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <p className="font-medium text-foreground">Quando notificar</p>
        </div>

        {EVENTOS.map((evento) => (
          <div key={evento.key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground">{evento.label}</p>
              <p className="text-xs text-muted-foreground">{evento.description}</p>
            </div>
            <Switch
              checked={Boolean(settings[evento.key])}
              onCheckedChange={(checked) => setSettings({ ...settings, [evento.key]: checked })}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={testing} onClick={testar}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar teste
        </Button>
        <Button variant="primary" disabled={saving} onClick={salvar}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar notificações
        </Button>
      </div>
    </div>
  );
}

function StatusCanal({ configurado }: { configurado: boolean }) {
  return configurado ? (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <Check className="h-3 w-3" />
      configurado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <X className="h-3 w-3" />
      não configurado
    </span>
  );
}

function Canal({
  nome,
  configurado,
  placeholder,
  valor,
  onChange,
  onRemover,
  ajuda,
  disabled,
}: {
  nome: string;
  configurado: boolean;
  placeholder: string;
  valor: string;
  onChange: (value: string) => void;
  onRemover: () => void;
  ajuda: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{nome}</Label>
        <StatusCanal configurado={configurado} />
      </div>
      <Input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={configurado ? '•••••• (salvo — digite para substituir)' : placeholder}
        className="font-mono text-sm"
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{ajuda}</p>
        {configurado && (
          <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={disabled} onClick={onRemover}>
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
