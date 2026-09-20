import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, GitBranch, Loader2, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
import api, { type CertificateQuotaDomain, type PreviewConfig, type PreviewItem } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { toast } from 'sonner';

/**
 * Preview por branch.
 *
 * Três avisos que a tela precisa dar antes de alguém ligar isto, porque nenhum deles
 * aparece sozinho na hora do erro:
 *
 * 1. **DNS curinga** — o painel não cria o registro; sem ele o preview sobe e fica
 *    inacessível, sem nada indicar a causa.
 * 2. **Cota do Let's Encrypt** — 50 certificados por domínio registrado por semana, e
 *    estourar deixa a **produção** uma semana sem poder emitir. Por isso o painel conta
 *    e mostra a barra por domínio.
 * 3. **Padrão vazio não faz nada** — é o default, para que ligar o switch não comece a
 *    criar apps a cada push.
 */

const NIVEL_ESTILO: Record<CertificateQuotaDomain['level'], string> = {
  ok: 'bg-primary',
  warning: 'bg-warning',
  exhausted: 'bg-destructive',
};

function QuotaBar({ domain }: { domain: CertificateQuotaDomain }) {
  const pct = Math.min(100, Math.round((domain.used / Math.max(1, domain.limit)) * 100));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-mono text-foreground" title={domain.registeredDomain}>
          {domain.registeredDomain}
        </span>
        <span
          className={
            domain.level === 'exhausted'
              ? 'shrink-0 font-medium text-destructive'
              : domain.level === 'warning'
                ? 'shrink-0 font-medium text-warning'
                : 'shrink-0 text-muted-foreground'
          }
        >
          {domain.used}/{domain.limit} emitidos em 7 dias
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${NIVEL_ESTILO[domain.level]}`} style={{ width: `${pct}%` }} />
      </div>
      {domain.level !== 'ok' && (
        <p className="text-xs text-muted-foreground">
          {domain.level === 'exhausted'
            ? 'Nenhum certificado novo será emitido neste domínio — nem para preview, nem para produção.'
            : `Restam ${domain.remaining}.`}
          {domain.resetsAt && ` A próxima vaga abre em ${formatDateTime(domain.resetsAt)}.`}
        </p>
      )}
    </div>
  );
}

export function PreviewSettings() {
  const [config, setConfig] = useState<PreviewConfig>({
    previewEnabled: false,
    previewBranchPattern: '',
    previewTtlDays: 7,
  });
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [portRange, setPortRange] = useState({ start: 21000, end: 21999 });
  const [quota, setQuota] = useState<CertificateQuotaDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [previews, cota] = await Promise.all([api.getPreviews(), api.getCertificateQuota()]);
      setItems(previews.items);
      setConfig(previews.config);
      setPortRange(previews.portRange);
      setQuota(cota.domains);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar previews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const salvar = async () => {
    setSaving(true);
    try {
      setConfig(await api.updatePreviewSettings(config));
      toast.success('Configurações de preview salvas');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  const semPadrao = config.previewEnabled && !config.previewBranchPattern.trim();
  const cotaCritica = quota.filter((d) => d.level !== 'ok');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-foreground">Preview por branch</p>
          <p className="text-sm text-muted-foreground">
            Push numa branch que casa com o padrão sobe um app efêmero em{' '}
            <span className="font-mono">branch.dominio-do-app</span>. Apagar a branch remove tudo.
          </p>
        </div>
        <Switch
          checked={config.previewEnabled}
          onCheckedChange={(checked) => setConfig({ ...config, previewEnabled: checked })}
        />
      </div>

      {cotaCritica.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-2 text-sm">
            <p className="font-medium text-foreground">Cota de certificados apertada</p>
            {cotaCritica.map((domain) => (
              <QuotaBar key={domain.registeredDomain} domain={domain} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">Antes de ligar, confira duas coisas</p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">DNS curinga:</strong> cada preview vira um subdomínio novo. Sem um
            registro <span className="font-mono">*.seu-dominio</span> apontando para este servidor, o preview sobe mas
            não abre — e o painel não tem como criar esse registro.
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Certificados:</strong> o Let's Encrypt emite no máximo 50 por domínio
            registrado a cada 7 dias, e o certbot aqui não faz curinga. Cada branch nova gasta uma emissão. Se a cota
            estourar, o domínio inteiro — <strong className="text-foreground">produção incluída</strong> — fica uma
            semana sem conseguir emitir certificado. O painel conta as emissões, avisa no log do deploy e deixa o app
            no ar em HTTP em vez de falhar o deploy.
          </p>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="previewPattern">Branches que geram preview</Label>
        <Input
          id="previewPattern"
          placeholder="feat/*,fix/*"
          value={config.previewBranchPattern}
          onChange={(e) => setConfig({ ...config, previewBranchPattern: e.target.value })}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Lista separada por vírgula, com <span className="font-mono">*</span> como curinga. Vazio significa nenhuma
          branch — é o padrão, para que ligar o switch não comece a criar apps sozinho.
        </p>
        {semPadrao && (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            Preview está ligado mas o padrão está vazio: nenhum push vai criar preview.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="previewTtl">Remover preview após (dias sem push)</Label>
        <Input
          id="previewTtl"
          type="number"
          min={0}
          max={90}
          value={config.previewTtlDays}
          onChange={(e) => setConfig({ ...config, previewTtlDays: parseInt(e.target.value, 10) || 0 })}
          className="w-32 font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Zero desliga a expiração. A limpeza roda às 4h e existe porque o evento de branch apagada pode nunca chegar —
          sem ela, um preview esquecido segura porta, disco e um processo no PM2. Portas vêm da faixa{' '}
          <span className="font-mono">
            {portRange.start}-{portRange.end}
          </span>{' '}
          (<span className="font-mono">PREVIEW_PORT_RANGE</span>), nunca de fora dela.
        </p>
      </div>

      <div className="flex justify-end">
        <Button variant="gradient" size="sm" disabled={saving} onClick={salvar}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar preview
        </Button>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <GitBranch className="h-4 w-4 text-primary" />
          Previews ativos ({items.length})
        </p>

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum preview no ar.
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
                <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-foreground" title={item.name}>
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.previewBranch}
                    {item.parentName && ` · de ${item.parentName}`}
                    {` · porta ${item.port}`}
                    {item.expiresAt && ` · expira em ${formatDateTime(item.expiresAt)}`}
                  </p>
                </div>
                {item.domain && (
                  <Button size="icon-sm" variant="ghost" asChild title={`Abrir ${item.domain}`}>
                    <a href={`https://${item.domain}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                <ConfirmDeleteDialog
                  name={item.name}
                  title="Remover este preview?"
                  description={
                    <p>
                      O processo é parado, o vhost do Nginx removido e os arquivos apagados. Um novo push na branch{' '}
                      <span className="font-mono">{item.previewBranch}</span> recria o preview do zero.
                    </p>
                  }
                  confirmLabel="Remover preview"
                  onConfirm={async () => {
                    await api.deletePreview(item.name);
                    toast.success('Preview removido');
                    await load();
                  }}
                  trigger={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
