import { useState, useEffect } from 'react';
import { Settings, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import api from '@/lib/api';

interface AppConfigModalProps {
  appId: string;
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface ConfigForm {
  envVars: string;
  installCommand: string;
  buildCommand: string;
  migrateCommand: string;
  startCommand: string;
}

export function AppConfigModal({ appId, appName, open, onOpenChange, onSaved }: AppConfigModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<ConfigForm>({
    envVars: '',
    installCommand: '',
    buildCommand: '',
    migrateCommand: '',
    startCommand: '',
  });

  // Load config when modal opens
  useEffect(() => {
    if (open && appId) {
      loadConfig();
    }
  }, [open, appId]);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const app = await api.getApp(appId);
      console.log('[AppConfigModal] Loaded app config:', app);
      
      setForm({
        envVars: app.envVars ?? '',
        installCommand: app.installCommand ?? '',
        buildCommand: app.buildCommand ?? '',
        migrateCommand: app.migrateCommand ?? '',
        startCommand: app.startCommand ?? '',
      });
    } catch (error: any) {
      console.error('[AppConfigModal] Load error:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    // Build payload with only non-undefined values
    // Empty string means user wants to clear the field
    const payload: Record<string, string> = {};
    
    // Always include all fields - the backend should handle empty strings
    payload.envVars = form.envVars;
    payload.installCommand = form.installCommand;
    payload.buildCommand = form.buildCommand;
    payload.migrateCommand = form.migrateCommand;
    payload.startCommand = form.startCommand;

    console.log('[AppConfigModal] Saving config:', {
      appId,
      payload: {
        ...payload,
        envVars: payload.envVars?.substring(0, 50) + '...',
      }
    });

    try {
      const result = await api.updateApp(appId, payload);
      console.log('[AppConfigModal] Save result:', result);
      
      toast.success('Configurações salvas! Serão aplicadas no próximo deploy.');
      onOpenChange(false);
      onSaved?.();
    } catch (error: any) {
      console.error('[AppConfigModal] Save error:', error);
      toast.error(error.message || 'Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof ConfigForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configurações - {appName}
          </DialogTitle>
          <DialogDescription>
            Configure variáveis de ambiente e comandos customizados. Alterações serão aplicadas no próximo deploy.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex h-[300px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Environment Variables */}
            <div className="space-y-2">
              <Label htmlFor="envVars" className="text-sm font-medium">
                Variáveis de Ambiente (.env)
              </Label>
              <Textarea
                id="envVars"
                placeholder="DATABASE_URL=postgres://...&#10;API_KEY=your_api_key&#10;NODE_ENV=production"
                className="font-mono text-sm min-h-[120px] bg-background border-border"
                value={form.envVars}
                onChange={(e) => updateField('envVars', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Uma variável por linha no formato KEY=VALUE. Disponíveis durante build e runtime.
              </p>
            </div>

            {/* Custom Commands Section */}
            <div className="space-y-4">
              <div className="border-b border-border pb-2">
                <h4 className="text-sm font-medium text-foreground">Comandos Customizados (opcional)</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe em branco para usar os comandos padrão de cada etapa.
                </p>
              </div>

              {/* Install Command */}
              <div className="space-y-2">
                <Label htmlFor="installCommand" className="text-sm">
                  Comando de Install
                </Label>
                <Input
                  id="installCommand"
                  placeholder="npm ci (padrão automático)"
                  className="font-mono text-sm"
                  value={form.installCommand}
                  onChange={(e) => updateField('installCommand', e.target.value)}
                />
              </div>

              {/* Build Command */}
              <div className="space-y-2">
                <Label htmlFor="buildCommand" className="text-sm">
                  Comando de Build
                </Label>
                <Input
                  id="buildCommand"
                  placeholder="npm run build (padrão)"
                  className="font-mono text-sm"
                  value={form.buildCommand}
                  onChange={(e) => updateField('buildCommand', e.target.value)}
                />
              </div>

              {/* Migrate Command */}
              <div className="space-y-2">
                <Label htmlFor="migrateCommand" className="text-sm">
                  Comando de Migrate
                </Label>
                <Input
                  id="migrateCommand"
                  placeholder="npx prisma migrate deploy (padrão para Prisma)"
                  className="font-mono text-sm"
                  value={form.migrateCommand}
                  onChange={(e) => updateField('migrateCommand', e.target.value)}
                />
              </div>

              {/* Start Command */}
              <div className="space-y-2">
                <Label htmlFor="startCommand" className="text-sm">
                  Comando de Start
                </Label>
                <Input
                  id="startCommand"
                  placeholder="npm run start (padrão)"
                  className="font-mono text-sm"
                  value={form.startCommand}
                  onChange={(e) => updateField('startCommand', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
