import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { NotificationSettings } from '@/components/NotificationSettings';
import { 
  Server,
  Shield,
  Bell,
  Database,
  Trash2,
  Save,
  RefreshCw,
  Mail,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function Settings() {
  const [settings, setSettings] = useState({
    serverIp: '62.72.9.22',
    backendPort: '10001',
    frontendPort: '10000',
    appsPath: '~/apps',
    retentionDays: '30',
    autoCleanup: true,
    slackWebhook: '',
  });

  const [emailSettings, setEmailSettings] = useState({
    emailEnabled: false,
    emailRecipient: '',
  });

  const [loadingEmail, setLoadingEmail] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    loadEmailSettings();
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

  const handleSave = () => {
    toast.success('Settings saved successfully');
  };

  const handleTestConnection = () => {
    toast.success('Connection test successful');
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="mt-1 text-muted-foreground">
            Configure your DeployHub instance
          </p>
        </div>

        <div className="space-y-8">
          {/* Server Configuration */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <Server className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Server Configuration</h3>
            </div>
            
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="serverIp">Server IP</Label>
                  <Input
                    id="serverIp"
                    value={settings.serverIp}
                    onChange={(e) => setSettings({ ...settings, serverIp: e.target.value })}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appsPath">Apps Directory</Label>
                  <Input
                    id="appsPath"
                    value={settings.appsPath}
                    onChange={(e) => setSettings({ ...settings, appsPath: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backendPort">Backend Port</Label>
                  <Input
                    id="backendPort"
                    type="number"
                    value={settings.backendPort}
                    onChange={(e) => setSettings({ ...settings, backendPort: e.target.value })}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frontendPort">Frontend Port</Label>
                  <Input
                    id="frontendPort"
                    type="number"
                    value={settings.frontendPort}
                    onChange={(e) => setSettings({ ...settings, frontendPort: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>

              <Button variant="outline" onClick={handleTestConnection}>
                <RefreshCw className="h-4 w-4" />
                Test Connection
              </Button>
            </div>
          </div>

          {/* Retention Settings */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <Database className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Version Retention</h3>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="retentionDays">Retention Period (days)</Label>
                <Input
                  id="retentionDays"
                  type="number"
                  value={settings.retentionDays}
                  onChange={(e) => setSettings({ ...settings, retentionDays: e.target.value })}
                  className="w-32 font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  Release versions older than this will be automatically deleted
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Automatic Cleanup</p>
                  <p className="text-sm text-muted-foreground">
                    Run daily cron job to delete old versions
                  </p>
                </div>
                <Switch
                  checked={settings.autoCleanup}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoCleanup: checked })}
                />
              </div>
            </div>
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

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="slackWebhook">Slack Webhook URL</Label>
                <Input
                  id="slackWebhook"
                  placeholder="https://hooks.slack.com/services/..."
                  value={settings.slackWebhook}
                  onChange={(e) => setSettings({ ...settings, slackWebhook: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">
                  Optional: Send deploy notifications to Slack
                </p>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Security</h3>
            </div>
            
            <div className="space-y-4">
              <Button variant="outline">
                Change Password
              </Button>
              <Button variant="outline">
                Regenerate API Keys
              </Button>
              <Button variant="outline">
                Download SSH Keys
              </Button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Trash2 className="h-5 w-5 text-destructive" />
              <h3 className="font-semibold text-destructive">Danger Zone</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Clear All Logs</p>
                  <p className="text-sm text-muted-foreground">
                    Remove all stored log data from the database
                  </p>
                </div>
                <Button variant="destructive" size="sm">
                  Clear Logs
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Reset Configuration</p>
                  <p className="text-sm text-muted-foreground">
                    Reset all settings to default values
                  </p>
                </div>
                <Button variant="destructive" size="sm">
                  Reset
                </Button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-4">
            <Button variant="outline">
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSave}>
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
