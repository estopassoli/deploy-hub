import { Layout } from '@/components/layout/Layout';
import { NotificationSettings } from '@/components/NotificationSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import {
  Bell,
  Database,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Server,
  Trash2
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/** URL da API em uso, para a seção de servidor mostrar o que está valendo. */
const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:10001/api').trim();

export default function Settings() {
  // Retenção e limpeza automática agora são persistidas de verdade, na tabela Setting,
  // e lidas pelo cron de limpeza. Antes eram estado local que o "Save" só transformava
  // num toast de sucesso, enquanto o servidor seguia com RETENTION_DAYS = 30 fixo.
  const [general, setGeneral] = useState({ retentionDays: 30, autoCleanup: true });
  const [loadingGeneral, setLoadingGeneral] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);

  const [emailSettings, setEmailSettings] = useState({
    emailEnabled: false,
    emailRecipient: '',
  });

  const [loadingEmail, setLoadingEmail] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    loadEmailSettings();
    loadGeneralSettings();
  }, []);

  const loadEmailSettings = async () => {
    try {
      const data = await api.getSettings();
      setEmailSettings({
        emailEnabled: data.emailEnabled,
        emailRecipient: data.emailRecipient || '',
      });
    } catch (error) {
      console.error('Failed to load email settings:', error);
    } finally {
      setLoadingEmail(false);
    }
  };

  const loadGeneralSettings = async () => {
    try {
      setGeneral(await api.getGeneralSettings());
    } catch (error) {
      console.error('Falha ao carregar configurações gerais:', error);
    } finally {
      setLoadingGeneral(false);
    }
  };

  const handleSaveGeneral = async () => {
    setSavingGeneral(true);
    try {
      const saved = await api.updateGeneralSettings(general);
      setGeneral(saved);
      toast.success(
        saved.autoCleanup
          ? `Limpeza automática ligada, mantendo ${saved.retentionDays} dias de releases e logs.`
          : 'Limpeza automática desligada — nenhuma release será removida.',
      );
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar configurações');
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleSaveEmailSettings = async () => {
    if (emailSettings.emailEnabled && !emailSettings.emailRecipient) {
      toast.error('Informe o email de destino para ativar notificações');
      return;
    }

    setSavingEmail(true);
    try {
      await api.updateEmailSettings({
        emailEnabled: emailSettings.emailEnabled,
        emailRecipient: emailSettings.emailRecipient || undefined,
      });
      toast.success('Configurações de email salvas');
    } catch (error) {
      toast.error('Erro ao salvar configurações de email');
    } finally {
      setSavingEmail(false);
    }
  };

  const [clearingLogs, setClearingLogs] = useState(false);

  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      const { removed } = await api.clearSystemLogs();
      toast.success(`${removed} registro(s) removido(s)`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao limpar logs');
    } finally {
      setClearingLogs(false);
    }
  };

  /** Bate de verdade no /api/system/health em vez de só mostrar um toast. */
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const health = await api.healthCheck();
      toast.success(`Backend respondeu: ${health.status}`);
    } catch (error: any) {
      toast.error(error.message || 'Backend não respondeu');
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="mt-1 text-muted-foreground">
            Configurações do seu DeployHub
          </p>
        </div>

        <div className="space-y-8">
          {/* Server Configuration */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <Server className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Servidor</h3>
            </div>

            {/*
              Estes valores vivem no `backend/.env` e no vhost do Nginx: mudá-los por
              aqui exigiria o painel reescrever a própria configuração e se reiniciar.
              Os campos editáveis que existiam aqui nunca fizeram nada — o "Save" só
              exibia um toast. Viraram somente-leitura, mostrando o que está em uso.
            */}
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">API em uso</Label>
                  <p className="font-mono text-sm text-foreground break-all">{apiBaseUrl}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Diretório dos apps</Label>
                  <p className="font-mono text-sm text-foreground">
                    definido por <span className="text-primary">APPS_DIR</span> em backend/.env
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Porta da API, diretório dos apps e domínios são configurados em
                <span className="font-mono text-foreground"> backend/.env</span> e no Nginx,
                aplicados no próximo restart do serviço.
              </p>

              <Button variant="outline" onClick={handleTestConnection} disabled={testingConnection}>
                {testingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Testar conexão
              </Button>
            </div>
          </div>

          {/* Retention Settings */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <Database className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Retenção de releases</h3>
            </div>

            {loadingGeneral ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="retentionDays">Período de retenção (dias)</Label>
                  <Input
                    id="retentionDays"
                    type="number"
                    min={1}
                    max={365}
                    value={general.retentionDays}
                    onChange={(e) =>
                      setGeneral({ ...general, retentionDays: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-32 font-mono"
                  />
                  <p className="text-sm text-muted-foreground">
                    Releases e logs de sistema mais antigos que isso são removidos pela limpeza
                    diária. A release ativa nunca é apagada, independente da idade.
                  </p>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-foreground">Limpeza automática</p>
                    <p className="text-sm text-muted-foreground">
                      Roda todo dia às 3h (releases) e 4h (logs). Desligado, nada é removido e o
                      disco cresce indefinidamente.
                    </p>
                  </div>
                  <Switch
                    checked={general.autoCleanup}
                    onCheckedChange={(checked) => setGeneral({ ...general, autoCleanup: checked })}
                  />
                </div>

                <div className="flex justify-end">
                  <Button variant="gradient" size="sm" disabled={savingGeneral} onClick={handleSaveGeneral}>
                    {savingGeneral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar retenção
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <Bell className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Notifications</h3>
            </div>
            
            <div className="space-y-4">
              <NotificationSettings />

              <Separator />

              {/* Email Notifications Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <p className="font-medium text-foreground">Email Notifications</p>
                </div>
                
                {loadingEmail ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando...
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">Ativar notificações por email</p>
                        <p className="text-xs text-muted-foreground">
                          Receba alertas de deploy e aplicações paradas
                        </p>
                      </div>
                      <Switch
                        checked={emailSettings.emailEnabled}
                        onCheckedChange={(checked) => 
                          setEmailSettings({ ...emailSettings, emailEnabled: checked })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="emailRecipient">Email de destino</Label>
                      <Input
                        id="emailRecipient"
                        type="email"
                        placeholder="seu@email.com"
                        value={emailSettings.emailRecipient}
                        onChange={(e) => 
                          setEmailSettings({ ...emailSettings, emailRecipient: e.target.value })
                        }
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Notificações serão enviadas para este endereço
                      </p>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleSaveEmailSettings}
                      disabled={savingEmail}
                    >
                      {savingEmail ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Salvar Email
                    </Button>
                  </>
                )}
              </div>

            </div>
          </div>

          {/*
            Removidos daqui: "Change Password", "Regenerate API Keys", "Download SSH
            Keys", "Reset Configuration" e o "Save Changes" global. Nenhum deles tinha
            backend — eram botões que não faziam nada. Cada seção agora salva a si
            mesma, e o que sobrou na tela funciona de verdade.
          */}

          {/* Zona de perigo */}
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Trash2 className="h-5 w-5 text-destructive" />
              <h3 className="font-semibold text-destructive">Zona de perigo</h3>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Limpar histórico de logs</p>
                <p className="text-sm text-muted-foreground">
                  Apaga todos os registros de atividade do sistema. Deploys, releases e métricas
                  não são afetados.
                </p>
              </div>
              <Button variant="destructive" size="sm" disabled={clearingLogs} onClick={handleClearLogs}>
                {clearingLogs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Limpar logs
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
