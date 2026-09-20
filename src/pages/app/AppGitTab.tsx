import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout, KeyValue, KeyValueList, Tag } from '@/components/ds';
import { useApp } from './AppContext';

/**
 * Git e CI do app.
 *
 * Substitui a página global `/github`, que tinha um `<select>` de app: o contexto vivia
 * em `useState` e a tela sempre reselecionava o primeiro app da lista, ignorando o
 * `?app=` da URL. Deep-link, botão voltar, aba nova e notificação clicável ficavam
 * todos quebrados — e aqui o app já está no cabeçalho da página.
 *
 * O secret aparece mascarado por padrão; revelar é ação explícita e copiar funciona sem
 * revelar.
 */
export default function AppGitTab() {
  const { app, reload } = useApp();
  const [yaml, setYaml] = useState<string | null>(null);
  const [erroYaml, setErroYaml] = useState<string | null>(null);
  const [revelado, setRevelado] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [regerando, setRegerando] = useState(false);

  const carregarYaml = useCallback(async () => {
    setErroYaml(null);
    try {
      const data: any = await api.getGithubWorkflow(app.id);
      setYaml(typeof data === "string" ? data : (data as any).workflow);
    } catch (e: any) {
      // 400 quando SSH_HOST não está configurada: dizer isso é melhor que um <pre> vazio.
      setErroYaml(e?.message || 'Não foi possível gerar o workflow');
      setYaml('');
    }
  }, [app.id]);

  useEffect(() => {
    carregarYaml();
  }, [carregarYaml]);

  const copiar = async (texto: string, qual: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(qual);
    toast.success('Copiado');
    setTimeout(() => setCopiado(null), 1600);
  };

  const urlWebhook = `${import.meta.env.VITE_API_URL || ''}/webhook/github/${app.name}`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
          <span className="flex-1" />
          <Tag>push em {app.branch || 'main'}</Tag>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <KeyValueList>
            <KeyValue label="URL" title={urlWebhook}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate">{urlWebhook}</span>
                <Button variant="ghost" size="icon-xs" aria-label="Copiar URL do webhook" onClick={() => copiar(urlWebhook, 'url')}>
                  {copiado === 'url' ? <Check aria-hidden /> : <Copy aria-hidden />}
                </Button>
              </span>
            </KeyValue>
            <KeyValue label="Secret">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate tracking-[0.08em]">
                  {app.webhookSecret ? (revelado ? app.webhookSecret : '••••••••••••••••') : 'não configurado'}
                </span>
                {app.webhookSecret && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${revelado ? 'Ocultar' : 'Revelar'} secret do webhook`}
                      onClick={() => setRevelado((v) => !v)}
                    >
                      {revelado ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Copiar secret do webhook"
                      onClick={() => copiar(app.webhookSecret, 'secret')}
                    >
                      {copiado === 'secret' ? <Check aria-hidden /> : <Copy aria-hidden />}
                    </Button>
                  </>
                )}
              </span>
            </KeyValue>
            <KeyValue label="Evento">push</KeyValue>
          </KeyValueList>

          {!app.webhookSecret && (
            <Callout tone="red" title="Este app não tem secret de webhook">
              Desde a última atualização o webhook é recusado com 401 quando não há como autenticar a
              requisição. Gere um secret e configure-o no GitHub em Settings → Webhooks.
            </Callout>
          )}

          <div className="flex justify-end">
            <Button
              variant="secondary"
              aria-busy={regerando ? 'true' : undefined}
              onClick={async () => {
                if (!window.confirm('Gerar um secret novo invalida o webhook atual até você atualizá-lo no GitHub. Continuar?'))
                  return;
                setRegerando(true);
                try {
                  await api.regenerateWebhookSecret(app.id);
                  await reload();
                  toast.success('Secret regenerado — atualize no GitHub');
                } catch (e: any) {
                  toast.error(e?.message || 'Não foi possível regenerar');
                } finally {
                  setRegerando(false);
                }
              }}
            >
              <RefreshCw aria-hidden />
              Gerar novo secret
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow do GitHub Actions</CardTitle>
          <span className="flex-1" />
          {yaml && (
            <Button variant="ghost" size="xs" onClick={() => copiar(yaml, 'yaml')}>
              {copiado === 'yaml' ? <Check aria-hidden /> : <Copy aria-hidden />}
              Copiar
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ol className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] leading-5 text-text-2">
            <li>
              <span className="font-mono text-2xs text-text-3">01</span> Copie o secret acima para{' '}
              <span className="font-mono text-xs">Settings → Secrets → DEPLOY_WEBHOOK_SECRET</span>.
            </li>
            <li>
              <span className="font-mono text-2xs text-text-3">02</span> Salve o YAML em{' '}
              <span className="font-mono text-xs">.github/workflows/deploy.yml</span>.
            </li>
            <li>
              <span className="font-mono text-2xs text-text-3">03</span> Faça push em{' '}
              <span className="font-mono text-xs">{app.branch || 'main'}</span>.
            </li>
          </ol>

          {erroYaml ? (
            <Callout
              tone="red"
              title="O servidor não conseguiu gerar o workflow"
              action={
                <Button variant="secondary" size="xs" onClick={carregarYaml}>
                  Tentar de novo
                </Button>
              }
            >
              {erroYaml}
            </Callout>
          ) : yaml === null ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <pre className="terminal-scroll m-0 max-h-96 overflow-auto rounded-[8px] border border-line-2 bg-bg-0 p-3 font-mono text-[12.5px] leading-5 text-text-2">
              {yaml}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
