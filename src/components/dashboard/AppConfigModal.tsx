import { useState, useEffect, useMemo } from 'react';
import { Settings, Save, Loader2, RotateCcw } from 'lucide-react';
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
import { cn } from '@/lib/utils';

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
  appDir: string;
  workspacePackage: string;
}

const defaultForm: ConfigForm = {
  envVars: '',
  installCommand: '',
  buildCommand: '',
  migrateCommand: '',
  startCommand: '',
  appDir: '',
  workspacePackage: '',
};

export function AppConfigModal({ appId, appName, open, onOpenChange, onSaved }: AppConfigModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalForm, setOriginalForm] = useState<ConfigForm>(defaultForm);
  const [form, setForm] = useState<ConfigForm>(defaultForm);

  // Track which fields have been modified
  const modifiedFields = useMemo(() => {
    const modified: Record<keyof ConfigForm, boolean> = {
      envVars: form.envVars !== originalForm.envVars,
      installCommand: form.installCommand !== originalForm.installCommand,
      buildCommand: form.buildCommand !== originalForm.buildCommand,
      migrateCommand: form.migrateCommand !== originalForm.migrateCommand,
      startCommand: form.startCommand !== originalForm.startCommand,
      appDir: form.appDir !== originalForm.appDir,
      workspacePackage: form.workspacePackage !== originalForm.workspacePackage,
    };
    return modified;
  }, [form, originalForm]);

  const hasChanges = useMemo(() => {
    return Object.values(modifiedFields).some(Boolean);
  }, [modifiedFields]);

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
      
      const loadedForm: ConfigForm = {
        envVars: app.envVars ?? '',
        installCommand: app.installCommand ?? '',
        buildCommand: app.buildCommand ?? '',
        migrateCommand: app.migrateCommand ?? '',
        startCommand: app.startCommand ?? '',
        appDir: app.appDir ?? '',
        workspacePackage: app.workspacePackage ?? '',
      };
      
      setOriginalForm(loadedForm);
      setForm(loadedForm);
    } catch (error: any) {
      console.error('[AppConfigModal] Load error:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    const payload: Record<string, string> = {
      envVars: form.envVars,
      installCommand: form.installCommand,
      buildCommand: form.buildCommand,
      migrateCommand: form.migrateCommand,
      startCommand: form.startCommand,
      appDir: form.appDir,
      workspacePackage: form.workspacePackage,
    };

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
      
      // Update original form to reflect saved state
      setOriginalForm(form);
      
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

  const handleReset = () => {
    setForm(originalForm);
  };

  const updateField = (field: keyof ConfigForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const getFieldClassName = (field: keyof ConfigForm) => {
    return cn(
      'font-mono text-sm transition-all duration-200',
      modifiedFields[field] && 'ring-2 ring-primary/50 border-primary bg-primary/5'
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col mx-4 sm:mx-auto">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Settings className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="truncate">Configurações - {appName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Configure variáveis de ambiente e comandos customizados.
            {hasChanges && (
              <span className="ml-2 inline-flex items-center gap-1 text-primary font-medium">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Alterações não salvas
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex h-[200px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6 py-2 sm:py-4 overflow-y-auto flex-1 px-1">
            {/* Environment Variables */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="envVars" className="text-sm font-medium flex items-center gap-2">
                  Variáveis de Ambiente (.env)
                  {modifiedFields.envVars && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">modificado</span>
                  )}
                </Label>
              </div>
              <Textarea
                id="envVars"
                placeholder="DATABASE_URL=postgres://...&#10;API_KEY=your_api_key&#10;NODE_ENV=production"
                className={cn(getFieldClassName('envVars'), 'min-h-[100px] sm:min-h-[120px] bg-background border-border')}
                value={form.envVars}
                onChange={(e) => updateField('envVars', e.target.value)}
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Uma variável por linha no formato KEY=VALUE.
              </p>
            </div>

            {/* Custom Commands Section */}
            <div className="space-y-3 sm:space-y-4">
              <div className="border-b border-border pb-2">
                <h4 className="text-sm font-medium text-foreground">Comandos Customizados (opcional)</h4>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  Deixe em branco para usar os comandos padrão.
                </p>
              </div>

              {/* Install Command */}
              <div className="space-y-1.5">
                <Label htmlFor="installCommand" className="text-sm flex items-center gap-2">
                  Comando de Install
                  {modifiedFields.installCommand && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">modificado</span>
                  )}
                </Label>
                <Input
                  id="installCommand"
                  placeholder="npm ci (padrão automático)"
                  className={getFieldClassName('installCommand')}
                  value={form.installCommand}
                  onChange={(e) => updateField('installCommand', e.target.value)}
                />
              </div>

              {/* Build Command */}
              <div className="space-y-1.5">
                <Label htmlFor="buildCommand" className="text-sm flex items-center gap-2">
                  Comando de Build
                  {modifiedFields.buildCommand && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">modificado</span>
                  )}
                </Label>
                <Input
                  id="buildCommand"
                  placeholder="npm run build (padrão)"
                  className={getFieldClassName('buildCommand')}
                  value={form.buildCommand}
                  onChange={(e) => updateField('buildCommand', e.target.value)}
                />
              </div>

              {/* Migrate Command */}
              <div className="space-y-1.5">
                <Label htmlFor="migrateCommand" className="text-sm flex items-center gap-2">
                  Comando de Migrate
                  {modifiedFields.migrateCommand && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">modificado</span>
                  )}
                </Label>
                <Input
                  id="migrateCommand"
                  placeholder="npx prisma migrate deploy (padrão para Prisma)"
                  className={getFieldClassName('migrateCommand')}
                  value={form.migrateCommand}
                  onChange={(e) => updateField('migrateCommand', e.target.value)}
                />
              </div>

              {/* Start Command */}
              <div className="space-y-1.5">
                <Label htmlFor="startCommand" className="text-sm flex items-center gap-2">
                  Comando de Start
                  {modifiedFields.startCommand && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">modificado</span>
                  )}
                </Label>
                <Input
                  id="startCommand"
                  placeholder="npm run start (padrão)"
                  className={getFieldClassName('startCommand')}
                  value={form.startCommand}
                  onChange={(e) => updateField('startCommand', e.target.value)}
                />
              </div>

              {/* App Directory */}
              <div className="space-y-1.5">
                <Label htmlFor="cfgAppDir" className="text-sm flex items-center gap-2">
                  App Directory (monorepo)
                  {modifiedFields.appDir && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">modificado</span>
                  )}
                </Label>
                <Input
                  id="cfgAppDir"
                  placeholder="apps/backend"
                  className={getFieldClassName('appDir')}
                  value={form.appDir}
                  onChange={(e) => updateField('appDir', e.target.value)}
                />
              </div>

              {/* Workspace package */}
              <div className="space-y-1.5">
                <Label htmlFor="cfgWorkspacePackage" className="text-sm flex items-center gap-2">
                  Workspace package (monorepo)
                  {modifiedFields.workspacePackage && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">modificado</span>
                  )}
                </Label>
                <Input
                  id="cfgWorkspacePackage"
                  placeholder="@blurp/backend"
                  className={getFieldClassName('workspacePackage')}
                  value={form.workspacePackage}
                  onChange={(e) => updateField('workspacePackage', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-shrink-0 gap-2 flex-col sm:flex-row pt-4 border-t border-border">
          {hasChanges && (
            <Button 
              variant="ghost" 
              onClick={handleReset} 
              disabled={isSaving}
              className="w-full sm:w-auto order-3 sm:order-1"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Desfazer
            </Button>
          )}
          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto order-1 sm:order-2">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              disabled={isSaving}
              className="flex-1 sm:flex-none"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isLoading || isSaving || !hasChanges}
              className="flex-1 sm:flex-none"
            >
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
