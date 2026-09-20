import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Callout, SaveBar } from '@/components/ds';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
import { useApp } from './AppContext';

/**
 * Configurações do app: endereço, runtime, health check, limites e exclusão.
 *
 * O padrão é linha rótulo/controle com a **origem do valor** dita embaixo — foi a falta
 * disso que fez a tela de Configurações antiga ter campos editáveis que não faziam
 * nada, porque o valor real vinha do `.env` do servidor.
 */
const RUNTIMES = [
  { value: 'auto', label: 'auto — Docker se houver Dockerfile/compose' },
  { value: 'pm2', label: 'pm2 — sempre processo Node' },
  { value: 'docker', label: 'docker — sempre container' },
];

export default function AppSettingsTab() {
  const { app, reload } = useApp();
  const navigate = useNavigate();

  const inicial = useMemo(
    () => ({
      domain: app.domain || '',
      branch: app.branch || '',
      runtime: app.runtime || 'auto',
      containerPort: app.containerPort != null ? String(app.containerPort) : '',
      dockerContext: app.dockerContext || '',
      healthPath: app.healthPath || '',
      maxMemoryMb: app.maxMemoryMb != null ? String(app.maxMemoryMb) : '',
      cpuLimit: app.cpuLimit != null ? String(app.cpuLimit) : '',
    }),
    [app],
  );

  const [form, setForm] = useState(inicial);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setForm(inicial), [inicial]);

  const sujos = useMemo(
    () => (Object.keys(inicial) as (keyof typeof inicial)[]).filter((k) => form[k] !== inicial[k]).length,
    [form, inicial],
  );

  const salvar = async () => {
    setSalvando(true);
    try {
      await api.updateApp(app.id, form);
      toast.success('Configurações salvas — aplicam no próximo deploy');
      await reload();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  };

  const ehDocker = app.activeRuntime === 'docker';

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Endereço e origem</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 @[700px]:grid-cols-2">
          <Linha
            label="Domínio"
            hint="Vira o server_name do vhost do Nginx no próximo deploy."
            value={form.domain}
            onChange={(v) => setForm({ ...form, domain: v })}
            placeholder="api.exemplo.com"
          />
          <Linha
            label="Branch"
            hint="O webhook só dispara deploy para pushes nesta branch."
            value={form.branch}
            onChange={(v) => setForm({ ...form, branch: v })}
            placeholder="main"
          />
          <Linha label="Porta" hint="Definida na criação do app; muda no Nginx e no processo." value={String(app.port)} readOnly />
          <Linha label="Repositório" hint="Origem do clone." value={app.repository || ''} readOnly />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runtime</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 @[700px]:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="runtime">Supervisor</Label>
            <select
              id="runtime"
              value={form.runtime}
              onChange={(e) => setForm({ ...form, runtime: e.target.value })}
              className="flex h-8 w-full items-center rounded-[6px] border border-line-2 bg-bg-1 px-2.5 text-[13px] text-text-1 transition-colors hover:border-line-3 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/[0.18] max-xl:h-12 max-xl:text-[16px]"
            >
              {RUNTIMES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="m-0 text-xs leading-4 text-text-3">
              Agora rodando em <span className="font-mono">{app.activeRuntime || 'pm2'}</span>.
            </p>
          </div>
          <Linha
            label="Porta interna do container"
            hint={`Sem valor, o painel usa o EXPOSE do Dockerfile e, na falta dele, ${app.port}.`}
            value={form.containerPort}
            onChange={(v) => setForm({ ...form, containerPort: v })}
          />
          <Linha
            label="Docker context"
            hint="Vazio = raiz do repositório."
            value={form.dockerContext}
            onChange={(v) => setForm({ ...form, dockerContext: v })}
          />
          <Linha
            label="Health check"
            hint="Checado em 127.0.0.1 depois do start. Sem resposta, o deploy volta para a release anterior."
            value={form.healthPath}
            onChange={(v) => setForm({ ...form, healthPath: v })}
            placeholder="/"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limites de recurso</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="m-0 text-[13px] leading-5 text-text-2">
            Num servidor com vários apps, um vazamento de memória em um consome a RAM da máquina
            inteira e o OOM killer do Linux escolhe a vítima — normalmente o processo maior, não o
            culpado. Um teto por app transforma "o servidor caiu" em "um app reiniciou". Vazio = sem
            limite.
          </p>
          <div className="grid gap-4 @[700px]:grid-cols-2">
            <Linha
              label="Memória máxima (MB)"
              hint={
                ehDocker
                  ? 'No Docker, ultrapassar faz o kernel MATAR o container — ele volta pelo restart.'
                  : 'No PM2, ultrapassar REINICIA o processo: interrupção curta, o app volta sozinho.'
              }
              value={form.maxMemoryMb}
              onChange={(v) => setForm({ ...form, maxMemoryMb: v })}
              placeholder="512"
            />
            <Linha
              label="Limite de CPU"
              hint={ehDocker ? '0.5 = meio núcleo.' : 'Só tem efeito em runtime Docker — o PM2 não limita CPU.'}
              value={form.cpuLimit}
              onChange={(v) => setForm({ ...form, cpuLimit: v })}
              placeholder="0.5"
            />
          </div>
        </CardContent>
      </Card>

      <SaveBar dirtyCount={sujos} saving={salvando} onDiscard={() => setForm(inicial)} onSave={salvar} />

      <section id="excluir" className="flex flex-col gap-3 pt-2">
        <Callout tone="red" title={`Excluir ${app.name}`}>
          Para o processo, remove containers e imagens, apaga o vhost do Nginx,{' '}
          <span className="font-mono">/var/www/{app.name}</span> e{' '}
          <span className="font-mono">~/apps/{app.name}</span> inteiro — com todas as releases e o
          histórico de deploys. Não tem volta.
        </Callout>
        <div className="flex justify-end">
          <ConfirmDeleteDialog
            name={app.name}
            description={
              <>
                <p>Esta ação é irreversível e afeta um app em produção.</p>
                <p>
                  Todas as releases em <span className="font-mono">~/apps/{app.name}/releases</span> serão
                  apagadas junto.
                </p>
              </>
            }
            confirmLabel={`Excluir ${app.name}`}
            onConfirm={async () => {
              await api.deleteApp(app.id);
              toast.success(`${app.name} excluído`);
              navigate('/');
            }}
            trigger={
              <Button variant="destructive">
                <Trash2 aria-hidden />
                Excluir app
              </Button>
            }
          />
        </div>
      </section>
    </div>
  );
}

function Linha({
  label,
  hint,
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const id = `campo-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="font-mono tabular-nums text-[12.5px]"
      />
      {hint && <p className="m-0 text-xs leading-4 text-text-3">{hint}</p>}
    </div>
  );
}
