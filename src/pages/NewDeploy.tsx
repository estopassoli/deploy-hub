import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { parseEnv, serializeEnv } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Callout,
  EnvTable,
  KeyValue,
  KeyValueList,
  Stepper,
  StepperCompact,
  StepperVertical,
  Tag,
  type EnvRow,
  type Step,
} from '@/components/ds';
import { DeployLogSheet } from '@/components/apps/DeployLogSheet';
import { useViewport } from '@/hooks/useViewport';

/**
 * Novo deploy — **um fluxo só**, para app avulso e monorepo.
 *
 * ## Por que os dois formulários viraram um
 *
 * Havia `/deploy` (14 campos, com uma seção "Monorepo (opcional)") e `/projects/new`
 * ("Detect apps"). O usuário tinha de **decidir o caminho antes de o sistema olhar o
 * repositório** — e quem não sabe que o repo é um monorepo escolhe errado.
 *
 * Aqui a ordem inverte: URL do repositório → detecção → um app ou N services →
 * configurar → build ao vivo.
 *
 * ## O que é checado antes de começar
 *
 * Nome e porta são verificados no passo 02, não no submit. O backend hoje **não recusa
 * nome de app já existente** — o deploy sobrescreve `.env` e comandos do app que já
 * está lá. Enquanto isso não for corrigido no servidor, a checagem do cliente é a
 * única barreira, e ela precisa ser explícita.
 */
type Passo = 0 | 1 | 2;

interface ServicoDetectado {
  appDir: string;
  workspacePackage: string;
  type: string;
  suggestedPort: number | null;
  suggestedName: string;
  hasPrisma: boolean;
  /** Escolhas do usuário no passo 02. */
  incluir: boolean;
  nome: string;
  porta: string;
  dominio: string;
}

export default function NewDeploy() {
  const navigate = useNavigate();
  const viewport = useViewport();

  const [passo, setPasso] = useState<Passo>(0);
  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');

  const [detectando, setDetectando] = useState(false);
  const [erroDeteccao, setErroDeteccao] = useState<string | null>(null);
  const [packageManager, setPackageManager] = useState<string | null>(null);
  const [servicos, setServicos] = useState<ServicoDetectado[] | null>(null);

  // App avulso
  const [nome, setNome] = useState('');
  const [porta, setPorta] = useState('3000');
  const [dominio, setDominio] = useState('');
  const [tipo, setTipo] = useState('nextjs');
  const [presets, setPresets] = useState<any[]>([]);
  const [env, setEnv] = useState<EnvRow[]>([]);

  const [erroPorta, setErroPorta] = useState<string | null>(null);
  const [nomesExistentes, setNomesExistentes] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chaveDeploy, setChaveDeploy] = useState('');

  useEffect(() => {
    api.getAppPresets().then(setPresets).catch(() => setPresets([]));
    api.getApps().then((lista) => setNomesExistentes(lista.map((a: any) => a.name))).catch(() => undefined);
  }, []);

  const ehMonorepo = (servicos?.length ?? 0) > 1;

  const passos: Step[] = useMemo(
    () => [
      { label: 'Repositório', state: passo > 0 ? 'done' : 'active' },
      { label: 'Configurar', state: passo > 1 ? 'done' : passo === 1 ? 'active' : 'pending' },
      { label: 'Build', state: passo === 2 ? 'active' : 'pending' },
    ],
    [passo],
  );

  const detectar = async () => {
    if (!repository.trim()) return;
    setDetectando(true);
    setErroDeteccao(null);
    try {
      const res = await api.detectProject({ repository: repository.trim(), branch: branch.trim() || 'main' });
      setPackageManager(res.packageManager);

      if (!res.services || res.services.length === 0) {
        // Repositório de app único: segue no caminho avulso.
        setServicos([]);
        setNome(sugerirNome(repository));
        setPasso(1);
        return;
      }

      setServicos(
        res.services.map((s) => ({
          ...s,
          incluir: true,
          nome: s.suggestedName,
          porta: s.suggestedPort ? String(s.suggestedPort) : '',
          dominio: '',
        })),
      );
      setNome(sugerirNome(repository));
      setPasso(1);
    } catch (e: any) {
      // Detecção falhou não é o fim: dá para seguir como app avulso.
      setErroDeteccao(e?.message || 'Não foi possível ler o repositório');
      setServicos([]);
      setNome(sugerirNome(repository));
    } finally {
      setDetectando(false);
    }
  };

  const conferirPorta = useCallback(async (valor: string) => {
    const n = parseInt(valor, 10);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) {
      setErroPorta('Use uma porta entre 1024 e 65535.');
      return;
    }
    try {
      const res = await api.checkPort(n);
      setErroPorta(res.available ? null : `Porta ocupada por ${res.usedBy ?? 'outro processo'}.`);
    } catch {
      setErroPorta(null);
    }
  }, []);

  const nomeDuplicado = nomesExistentes.includes(nome.trim());

  const enviar = async () => {
    setEnviando(true);
    try {
      if (ehMonorepo) {
        const incluidos = servicos!.filter((s) => s.incluir);
        await api.createProject({
          name: nome.trim(),
          repository: repository.trim(),
          branch: branch.trim() || 'main',
          envVars: serializeEnv(env),
          services: incluidos.map((s) => ({
            name: s.nome,
            appDir: s.appDir,
            workspacePackage: s.workspacePackage,
            type: s.type,
            port: parseInt(s.porta, 10),
            domain: s.dominio || undefined,
          })),
        });
        setChaveDeploy(nome.trim());
      } else {
        await api.deploy({
          repository: repository.trim(),
          name: nome.trim(),
          port: parseInt(porta, 10),
          domain: dominio || undefined,
          type: tipo,
          branch: branch.trim() || 'main',
          envVars: serializeEnv(env),
        });
        setChaveDeploy(nome.trim());
      }
      setPasso(2);
      setSheetOpen(true);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível iniciar o deploy');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex max-w-180 flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className="m-0 text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">Novo deploy</h1>
        {viewport === 'mobile' ? (
          <StepperCompact steps={passos} current={passo} hint={DICA[passo]} />
        ) : (
          <Stepper steps={passos} />
        )}
      </header>

      {/* ---------- 01 Repositório ---------- */}
      {passo === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Repositório</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="m-0 text-[13px] leading-5 text-text-2">
              Cole a URL e o painel lê o repositório antes de perguntar mais nada: se for um
              monorepo, ele lista os services; se não, segue como app único.
            </p>
            <div className="grid gap-4 @[700px]:grid-cols-[minmax(0,1fr)_160px]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="repo">URL do repositório</Label>
                <Input
                  id="repo"
                  value={repository}
                  onChange={(e) => setRepository(e.target.value)}
                  placeholder="git@github.com:usuario/repo.git"
                  className="font-mono tabular-nums text-[12.5px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="font-mono tabular-nums text-[12.5px]"
                />
              </div>
            </div>

            {erroDeteccao && (
              <Callout tone="amber" title="Não foi possível detectar services">
                {erroDeteccao} Dá para seguir configurando como app único.
              </Callout>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="primary"
                size={viewport === 'desktop' ? 'page' : 'touch'}
                disabled={!repository.trim() || detectando}
                aria-busy={detectando ? 'true' : undefined}
                onClick={detectar}
              >
                {detectando ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
                {detectando ? 'Lendo repositório…' : 'Detectar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- 02 Configurar ---------- */}
      {passo === 1 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{ehMonorepo ? 'Services detectados' : 'Configuração do app'}</CardTitle>
              <span className="flex-1" />
              {packageManager && <Tag>{packageManager}</Tag>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <KeyValueList>
                <KeyValue label="Repositório" title={repository}>
                  <span className="block truncate">{repository}</span>
                </KeyValue>
                <KeyValue label="Branch">{branch || 'main'}</KeyValue>
              </KeyValueList>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nome">{ehMonorepo ? 'Nome do projeto' : 'Nome do app'}</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  aria-invalid={nomeDuplicado}
                  className="font-mono tabular-nums text-[12.5px]"
                />
                {nomeDuplicado && (
                  <p className="m-0 text-xs leading-4 text-red">
                    Já existe um app com este nome. O servidor não recusa a repetição: o deploy
                    sobrescreveria o <span className="font-mono">.env</span> e os comandos do app
                    existente.
                  </p>
                )}
              </div>

              {ehMonorepo ? (
                <div className="flex flex-col gap-2">
                  {servicos!.map((s, i) => (
                    <div
                      key={s.appDir}
                      className="grid items-center gap-3 rounded-[8px] border border-line-2 bg-bg-0 p-3 @[700px]:grid-cols-[24px_minmax(0,1fr)_100px_minmax(0,1fr)]"
                    >
                      <input
                        type="checkbox"
                        checked={s.incluir}
                        aria-label={`Incluir ${s.suggestedName}`}
                        onChange={(e) => {
                          const copia = [...servicos!];
                          copia[i] = { ...s, incluir: e.target.checked };
                          setServicos(copia);
                        }}
                        className="size-4 accent-[hsl(var(--brand-strong))]"
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-medium text-text-1">{s.nome}</span>
                        <span className="truncate font-mono tabular-nums text-2xs text-text-3">
                          {s.workspacePackage} · {s.type}
                          {s.hasPrisma && ' · prisma'}
                        </span>
                      </div>
                      <Input
                        value={s.porta}
                        onChange={(e) => {
                          const copia = [...servicos!];
                          copia[i] = { ...s, porta: e.target.value };
                          setServicos(copia);
                        }}
                        placeholder="porta"
                        aria-label={`Porta de ${s.nome}`}
                        className="font-mono tabular-nums text-[12.5px]"
                      />
                      <Input
                        value={s.dominio}
                        onChange={(e) => {
                          const copia = [...servicos!];
                          copia[i] = { ...s, dominio: e.target.value };
                          setServicos(copia);
                        }}
                        placeholder="dominio.com (opcional)"
                        aria-label={`Domínio de ${s.nome}`}
                        className="font-mono tabular-nums text-[12.5px]"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 @[700px]:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tipo">Tipo</Label>
                    <select
                      id="tipo"
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value)}
                      className="flex h-8 w-full items-center rounded-[6px] border border-line-2 bg-bg-1 px-2.5 text-[13px] text-text-1 max-xl:h-12 max-xl:text-[16px]"
                    >
                      {(presets.length ? presets : [{ id: 'nextjs', label: 'Next.js' }]).map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="porta">Porta</Label>
                    <Input
                      id="porta"
                      value={porta}
                      onChange={(e) => setPorta(e.target.value)}
                      onBlur={(e) => conferirPorta(e.target.value)}
                      aria-invalid={Boolean(erroPorta)}
                      className="font-mono tabular-nums text-[12.5px]"
                    />
                    {erroPorta && <p className="m-0 text-xs leading-4 text-red">{erroPorta}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5 @[700px]:col-span-2">
                    <Label htmlFor="dominio">Domínio</Label>
                    <Input
                      id="dominio"
                      value={dominio}
                      onChange={(e) => setDominio(e.target.value)}
                      placeholder="app.exemplo.com (opcional)"
                      className="font-mono tabular-nums text-[12.5px]"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Variáveis de ambiente</CardTitle>
            </CardHeader>
            <CardContent>
              <EnvTable
                rows={env}
                variant="create"
                onAdd={() => {
                  const chave = window.prompt('Nome da variável')?.trim().toUpperCase();
                  if (!chave) return;
                  setEnv([...env, { key: chave, value: window.prompt(`Valor de ${chave}`) ?? '' }]);
                }}
                onPaste={() => {
                  const texto = window.prompt('Cole o conteúdo do .env');
                  if (!texto) return;
                  const mapa = new Map(env.map((r) => [r.key, r]));
                  for (const { key, value } of parseEnv(texto)) mapa.set(key, { key, value });
                  setEnv([...mapa.values()]);
                }}
                onRemove={(key) => setEnv(env.filter((r) => r.key !== key))}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size={viewport === 'desktop' ? 'page' : 'touch'} onClick={() => setPasso(0)}>
              Voltar
            </Button>
            <Button
              variant="primary"
              size={viewport === 'desktop' ? 'page' : 'touch'}
              disabled={!nome.trim() || nomeDuplicado || Boolean(erroPorta) || enviando}
              aria-busy={enviando ? 'true' : undefined}
              onClick={enviar}
            >
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              {ehMonorepo ? `Deployar ${servicos!.filter((s) => s.incluir).length} services` : 'Deployar'}
            </Button>
          </div>
        </>
      )}

      {/* ---------- 03 Build ao vivo ---------- */}
      {passo === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Build de {nome}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Callout tone="blue" title="O app atual continua no ar durante o build">
              O painel só troca o symlink <span className="font-mono">current</span> depois que o
              health check da release nova responde.
            </Callout>

            <StepperVertical
              steps={[
                { label: 'Clone do repositório', state: 'done' },
                { label: 'Instalar dependências', state: 'active' },
                { label: 'Build', state: 'pending' },
                { label: 'Migrations', state: 'pending' },
                { label: 'Start do processo', state: 'pending' },
                { label: 'Health check', state: 'pending' },
                { label: 'Nginx', state: 'pending' },
                { label: 'SSL', state: 'pending' },
              ]}
            />
            <p className="m-0 text-xs leading-4 text-text-3">
              As durações por etapa não são exibidas: o servidor grava as fases do pipeline, mas
              ainda não as envia ao cliente.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSheetOpen(true)}>
                Ver log do build
              </Button>
              <Button variant="primary" onClick={() => navigate(`/apps/${encodeURIComponent(nome)}`)}>
                <Check aria-hidden />
                Abrir o app
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DeployLogSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        deployKey={chaveDeploy}
        title={`Deploy de ${nome}`}
        onFinished={() => toast.success(`${nome} no ar`)}
      />
    </div>
  );
}

const DICA: Record<Passo, string> = {
  0: 'Cole a URL do repositório para o painel detectar o que há dentro.',
  1: 'Confirme nome, porta e domínio antes de começar o build.',
  2: 'O build está rodando. O app atual segue no ar até o health check passar.',
};

/** `git@github.com:user/minha-api.git` → `minha-api`. */
function sugerirNome(url: string): string {
  const limpo = url.trim().replace(/\.git$/, '');
  const ultimo = limpo.split(/[/:]/).pop() ?? '';
  return ultimo.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
}
