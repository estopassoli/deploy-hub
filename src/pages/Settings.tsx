import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Callout, PageHeader, Tag } from '@/components/ds';
import { NotificationSettings } from '@/components/NotificationSettings';
import { NotificationChannels } from '@/components/settings/NotificationChannels';
import { BackupSettings } from '@/components/settings/BackupSettings';
import { PreviewSettings } from '@/components/settings/PreviewSettings';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';

/**
 * Configurações.
 *
 * ## A regra que organiza a tela inteira
 *
 * **Todo controle ou salva de verdade, ou está desabilitado com o motivo escrito.**
 *
 * O "Save Changes" global de antes era placebo: mostrava sucesso e não gravava nada —
 * nem o e-mail. Havia seis botões sem handler, campos de IP e porta que pareciam
 * editáveis mas vinham do `.env` do servidor, e um "Test Connection" que respondia
 * sucesso sem testar coisa alguma.
 *
 * Cada linha agora declara **de onde vem o valor** (`env PORT`, `fixo no código`,
 * `servidor`, `neste navegador`), e o que não tem endpoint carrega o selo `em breve`
 * com a frase explicando. Um controle desenhado e desabilitado é honesto; um botão que
 * só dispara um toast de sucesso é mentira.
 */
const SECOES = [
  { id: 'servidor', label: 'Servidor' },
  { id: 'retencao', label: 'Retenção' },
  { id: 'notificacoes', label: 'Notificações' },
  { id: 'backup', label: 'Backup' },
  { id: 'preview', label: 'Preview' },
  { id: 'perigo', label: 'Zona de perigo' },
];

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:10001/api').trim();

export default function Settings() {
  const [geral, setGeral] = useState<{ retentionDays: number; autoCleanup: boolean } | null>(null);
  const [geralBase, setGeralBase] = useState<typeof geral>(null);
  const [salvandoGeral, setSalvandoGeral] = useState(false);

  const [email, setEmail] = useState<{ emailEnabled: boolean; emailRecipient: string } | null>(null);
  const [emailBase, setEmailBase] = useState<typeof email>(null);
  const [salvandoEmail, setSalvandoEmail] = useState(false);

  const [teste, setTeste] = useState<{ estado: 'nunca' | 'testando' | 'ok' | 'falhou'; detalhe?: string }>({
    estado: 'nunca',
  });
  const [limpando, setLimpando] = useState(false);
  const [secaoAtiva, setSecaoAtiva] = useState('servidor');
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Falha ao carregar não pode virar "sobrescrever a config real com defaults":
    // enquanto não há dado, a seção mostra esqueleto, não um formulário zerado.
    api
      .getGeneralSettings()
      .then((d) => {
        setGeral(d);
        setGeralBase(d);
      })
      .catch((e: any) => toast.error(e?.message || 'Não foi possível carregar a retenção'));

    api
      .getSettings()
      .then((d) => {
        const valor = { emailEnabled: d.emailEnabled, emailRecipient: d.emailRecipient || '' };
        setEmail(valor);
        setEmailBase(valor);
      })
      .catch((e: any) => toast.error(e?.message || 'Não foi possível carregar o e-mail'));
  }, []);

  const geralSujo = useMemo(
    () => Boolean(geral && geralBase && (geral.retentionDays !== geralBase.retentionDays || geral.autoCleanup !== geralBase.autoCleanup)),
    [geral, geralBase],
  );
  const emailSujo = useMemo(
    () => Boolean(email && emailBase && (email.emailEnabled !== emailBase.emailEnabled || email.emailRecipient !== emailBase.emailRecipient)),
    [email, emailBase],
  );

  const irPara = (id: string) => {
    setSecaoAtiva(id);
    document.getElementById(`secao-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={mainRef} className="flex max-w-180 flex-col gap-5">
      <PageHeader
        title="Configurações"
        meta={
          <>
            <span>Cada linha diz de onde vem o valor</span>
            <span aria-hidden>·</span>
            <span>{geralSujo || emailSujo ? 'alterações pendentes' : 'sem alterações pendentes'}</span>
          </>
        }
      />

      <nav
        aria-label="Seções"
        className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto border-b border-line-1 bg-bg-0 px-1 pb-2"
      >
        {SECOES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={secaoAtiva === s.id ? 'true' : undefined}
            onClick={() => irPara(s.id)}
            className={cn(
              'flex h-7 shrink-0 items-center rounded-md px-2.5 text-xs font-medium transition-colors max-xl:h-10 max-xl:text-[13px]',
              secaoAtiva === s.id ? 'bg-bg-3 text-text-1' : 'text-text-2 hover:bg-bg-2 hover:text-text-1',
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ---------------- Servidor ---------------- */}
      <Secao id="servidor" titulo="Servidor">
        <Linha label="API em uso" origem="env VITE_API_URL">
          <span className="font-mono tabular-nums text-xs text-text-1 break-all">{apiBaseUrl}</span>
        </Linha>

        <Linha label="Diretório dos apps" origem="env APPS_DIR">
          <span className="font-mono tabular-nums text-xs text-text-2">
            definido em backend/.env — sem edição pelo painel
          </span>
        </Linha>

        <Linha label="Porta da API" origem="env PORT">
          <span className="font-mono tabular-nums text-xs text-text-2">
            definida em backend/.env e aplicada no restart do serviço
          </span>
        </Linha>

        <Linha
          label="Testar conexão"
          origem="servidor"
          hint="Bate em GET /system/health de verdade — antes esta linha respondia sucesso sem testar nada."
        >
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              aria-busy={teste.estado === 'testando' ? 'true' : undefined}
              onClick={async () => {
                setTeste({ estado: 'testando' });
                const t0 = performance.now();
                try {
                  const saude = await api.healthCheck();
                  setTeste({
                    estado: 'ok',
                    detalhe: `${saude.status} · ${Math.round(performance.now() - t0)} ms`,
                  });
                } catch (e: any) {
                  setTeste({ estado: 'falhou', detalhe: e?.message || 'sem resposta' });
                }
              }}
            >
              {teste.estado === 'testando' ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
              Testar
            </Button>
            <span
              className={cn(
                'font-mono tabular-nums text-xs',
                teste.estado === 'ok' ? 'text-accent' : teste.estado === 'falhou' ? 'text-red' : 'text-text-3',
              )}
            >
              {teste.estado === 'nunca' ? 'nunca testado' : teste.detalhe ?? 'testando…'}
            </span>
          </div>
        </Linha>
      </Secao>

      {/* ---------------- Retenção ---------------- */}
      <Secao id="retencao" titulo="Retenção de releases e logs">
        {!geral ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <Callout tone="amber" title="O agendamento é fixo no servidor">
              Releases mais antigas que o prazo são apagadas do disco com{' '}
              <span className="font-mono">rm -rf</span>. A limpeza roda às 03:00 (releases) e 04:00
              (logs). Mudar o número aqui altera o **prazo**, não o horário — o cron está fixo no
              código do servidor.
            </Callout>

            <Linha label="Manter releases por" origem="servidor">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={geral.retentionDays}
                  onChange={(e) => setGeral({ ...geral, retentionDays: parseInt(e.target.value, 10) || 0 })}
                  aria-label="Dias de retenção"
                  className="w-24 font-mono tabular-nums"
                />
                <span className="text-[13px] text-text-3">dias</span>
              </div>
            </Linha>

            <Linha
              label="Limpeza automática"
              origem="servidor"
              hint="Desligada, nenhuma release é removida e o disco cresce até encher."
            >
              <Switch
                checked={geral.autoCleanup}
                aria-label="Limpeza automática"
                onCheckedChange={(v) => setGeral({ ...geral, autoCleanup: v })}
              />
            </Linha>

            <BarraSecao
              sujo={geralSujo}
              salvando={salvandoGeral}
              onDescartar={() => setGeral(geralBase)}
              onSalvar={async () => {
                setSalvandoGeral(true);
                try {
                  const salvo = await api.updateGeneralSettings(geral);
                  setGeral(salvo);
                  setGeralBase(salvo);
                  toast.success(
                    salvo.autoCleanup
                      ? `Limpeza ligada, mantendo ${salvo.retentionDays} dias.`
                      : 'Limpeza automática desligada — nenhuma release será removida.',
                  );
                } catch (e: any) {
                  toast.error(e?.message || 'Não foi possível salvar');
                } finally {
                  setSalvandoGeral(false);
                }
              }}
            />
          </>
        )}
      </Secao>

      {/* ---------------- Notificações ---------------- */}
      <Secao id="notificacoes" titulo="Notificações">
        <Linha
          label="Push do navegador"
          origem="neste navegador"
          hint="A permissão é do navegador, não da conta: ligar aqui não afeta quem abre o painel de outro aparelho."
        >
          <NotificationSettings />
        </Linha>

        {!email ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            <Linha label="E-mail" origem="servidor">
              <Switch
                checked={email.emailEnabled}
                aria-label="Notificações por e-mail"
                onCheckedChange={(v) => setEmail({ ...email, emailEnabled: v })}
              />
            </Linha>

            <Linha label="Destinatário" origem="servidor">
              <Input
                type="email"
                value={email.emailRecipient}
                onChange={(e) => setEmail({ ...email, emailRecipient: e.target.value })}
                placeholder="voce@dominio.com"
                aria-label="E-mail de destino"
                className="max-w-80 font-mono tabular-nums text-[12.5px]"
              />
            </Linha>

            <BarraSecao
              sujo={emailSujo}
              salvando={salvandoEmail}
              onDescartar={() => setEmail(emailBase)}
              onSalvar={async () => {
                if (email.emailEnabled && !email.emailRecipient) {
                  toast.error('Informe o e-mail de destino para ativar');
                  return;
                }
                setSalvandoEmail(true);
                try {
                  await api.updateEmailSettings({
                    emailEnabled: email.emailEnabled,
                    emailRecipient: email.emailRecipient || undefined,
                  });
                  setEmailBase(email);
                  toast.success('Configurações de e-mail salvas');
                } catch (e: any) {
                  toast.error(e?.message || 'Não foi possível salvar');
                } finally {
                  setSalvandoEmail(false);
                }
              }}
            />
          </>
        )}

        <div className="pt-2">
          <NotificationChannels />
        </div>
      </Secao>

      {/* ---------------- Backup ---------------- */}
      <Secao id="backup" titulo="Backup">
        <BackupSettings />
      </Secao>

      {/* ---------------- Preview ---------------- */}
      <Secao id="preview" titulo="Preview por branch">
        <PreviewSettings />
      </Secao>

      {/* ---------------- Zona de perigo ---------------- */}
      <Secao id="perigo" titulo="Zona de perigo">
        <Callout tone="red" title="Estas ações não têm desfazer">
          O painel não guarda cópia do que é removido aqui.
        </Callout>

        <Linha
          label="Limpar histórico de logs"
          origem="servidor"
          hint="Apaga os registros de atividade. Deploys, releases e métricas não são afetados."
        >
          <ConfirmDeleteDialog
            name="histórico de logs"
            title="Limpar o histórico de logs?"
            description={<p>Todos os registros de atividade do sistema serão apagados.</p>}
            confirmLabel="Limpar logs"
            onConfirm={async () => {
              setLimpando(true);
              try {
                const { removed } = await api.clearSystemLogs();
                toast.success(`${removed} registro(s) removido(s)`);
              } finally {
                setLimpando(false);
              }
            }}
            trigger={
              <Button variant="destructive" aria-busy={limpando ? 'true' : undefined}>
                <Trash2 aria-hidden />
                Limpar logs
              </Button>
            }
          />
        </Linha>

        <Linha
          label="Trocar senha"
          origem="em breve"
          hint="O controle está desenhado, mas ainda não existe endpoint para ele no backend."
        >
          <Button variant="secondary" disabled>
            Trocar senha
          </Button>
        </Linha>
      </Secao>
    </div>
  );
}

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={`secao-${id}`} aria-labelledby={`h-${id}`} className="flex scroll-mt-14 flex-col gap-3">
      <h2 id={`h-${id}`} className="m-0 text-sm font-semibold leading-5 tracking-[-0.005em] text-text-1">
        {titulo}
      </h2>
      <div className="flex flex-col gap-3 rounded-[8px] border border-line-2 bg-bg-1 p-4 max-md:p-3.5">{children}</div>
    </section>
  );
}

/**
 * Linha rótulo/controle com a **origem do valor**.
 *
 * O selo de origem é o que impede o retorno do defeito central da tela antiga: campos
 * que pareciam editáveis mas cujo valor real vinha do `.env` do servidor.
 */
function Linha({
  label,
  origem,
  hint,
  children,
}: {
  label: string;
  origem: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-x-4 gap-y-2 border-b border-line-1 pb-3 last:border-0 last:pb-0 @[640px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Label className="text-[13px] text-text-1">{label}</Label>
          {origem === 'em breve' ? (
            <Badge tone="neutral">em breve</Badge>
          ) : (
            <Tag>{origem}</Tag>
          )}
        </span>
        {hint && <p className="m-0 text-xs leading-4 text-text-3">{hint}</p>}
      </div>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  );
}

/** Um Salvar por seção, com o estado pendente visível. */
function BarraSecao({
  sujo,
  salvando,
  onDescartar,
  onSalvar,
}: {
  sujo: boolean;
  salvando: boolean;
  onDescartar: () => void;
  onSalvar: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      {sujo && <span className="mr-auto text-xs text-text-3">Alterações não salvas</span>}
      {sujo && (
        <Button variant="ghost" onClick={onDescartar} disabled={salvando}>
          Descartar
        </Button>
      )}
      <Button variant="primary" onClick={onSalvar} disabled={!sujo || salvando} aria-busy={salvando ? 'true' : undefined}>
        {salvando && <Loader2 className="animate-spin" aria-hidden />}
        {salvando ? 'Salvando…' : 'Salvar'}
      </Button>
    </div>
  );
}
