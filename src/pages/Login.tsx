import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Callout } from '@/components/ds/callout';
import { Kbd, KbdEnter } from '@/components/ds/kbd';
import { HubMark } from '@/components/shell/HubMark';
import { useApiProbe } from '@/hooks/useApiProbe';

/**
 * Login e criação de conta.
 *
 * ## Erro inline, nunca toast
 *
 * O interceptor de 401 redirecionava para `/login` em **qualquer** 401, inclusive no
 * próprio `POST /auth/login`. Senha errada recarregava a página antes de o `catch` do
 * formulário rodar: a tela só piscava e o erro nunca aparecia (o conserto mora em
 * `lib/api.ts`). Aqui o erro é um callout persistente acima do CTA.
 *
 * ## O modo vive na URL
 *
 * `?modo=cadastro` em vez de `useState`: o botão voltar volta ao login em vez de sair
 * do app, o reload preserva o modo, e alternar não apaga o que já foi digitado.
 *
 * ## Senha visível por padrão no cadastro
 *
 * Toda conta criada aqui administra o servidor inteiro e ainda tem shell root, e não
 * existe recuperação de senha. Campo mascarado, sem confirmação e sem medidor é a
 * receita para uma senha digitada errado que ninguém consegue recuperar.
 */
const REQUISITOS = [
  { id: 'min', label: '6+ caracteres', ok: (s: string) => s.length >= 6 },
  { id: 'mix', label: 'letra e número', ok: (s: string) => /[A-Za-z]/.test(s) && /\d/.test(s) },
  { id: 'forte', label: '12+ recomendado', ok: (s: string) => s.length >= 12 },
];

export default function Login() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { login, register } = useAuth();
  const api = useApiProbe();

  const cadastro = params.get('modo') === 'cadastro';
  const destino = params.get('de') || '/';

  const [form, setForm] = useState({ email: '', password: '', name: '', secret: '' });
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<{ titulo: string; detalhe: string } | null>(null);
  const [erroSecret, setErroSecret] = useState<string | null>(null);

  // No cadastro a senha começa visível; no login, mascarada.
  useEffect(() => setVerSenha(cadastro), [cadastro]);

  const forca = useMemo(() => REQUISITOS.map((r) => ({ ...r, atende: r.ok(form.password) })), [form.password]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setErroSecret(null);
    setEnviando(true);

    try {
      if (cadastro) await register(form.email, form.password, form.name, form.secret);
      else await login(form.email, form.password);
      navigate(destino, { replace: true });
    } catch (e: any) {
      const mensagem: string = e?.message || 'Não foi possível entrar';

      // 403 do registro é erro do campo, não da tela.
      if (cadastro && /secret|chave|registro|403/i.test(mensagem)) {
        setErroSecret('Chave de registro inválida.');
      } else if (/401|credenciais|unauthorized|senha|incorret/i.test(mensagem)) {
        setErro({ titulo: 'E-mail ou senha incorretos', detalhe: 'Confira o endereço e tente de novo.' });
      } else if (/fetch|network|failed to fetch/i.test(mensagem)) {
        setErro({
          titulo: 'API inacessível',
          detalhe: 'O painel não conseguiu falar com o servidor. Verifique se o backend está no ar.',
        });
      } else {
        setErro({ titulo: mensagem, detalhe: 'Tente de novo em instantes.' });
      }
    } finally {
      setEnviando(false);
    }
  };

  const trocarModo = () => {
    const proximo = new URLSearchParams(params);
    if (cadastro) proximo.delete('modo');
    else proximo.set('modo', 'cadastro');
    setParams(proximo);
    setErro(null);
    setErroSecret(null);
  };

  return (
    <div className="flex min-h-viewport bg-bg-0 text-text-1">
      {/*
        Coluna do formulário: 360px, alinhada ao TOPO (160px), não centrada na vertical.
        Centrar faz o bloco dançar quando o modo cadastro acrescenta dois campos.
      */}
      <main className="flex min-w-0 flex-1 flex-col items-center px-8 pb-16 pt-40 max-md:px-4 max-md:pt-16">
        <div className="flex w-[360px] max-w-full flex-col gap-6">
          <div className="flex flex-col gap-5">
            <span className="flex items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-strong text-bg-0">
                <HubMark className="size-[18px]" />
              </span>
              <span className="text-sm font-semibold leading-[18px] tracking-[-0.01em] text-text-1">DeployHub</span>
            </span>

            <div className="flex flex-col gap-1.5">
              <h1 className="m-0 text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-text-1">
                {cadastro ? 'Criar conta' : 'Entrar no painel'}
              </h1>
              <p className="m-0 font-mono tabular-nums text-xs leading-[18px] text-text-3">
                {import.meta.env.VITE_SERVER_NAME || 'servidor'} · {window.location.host}
              </p>
            </div>
          </div>

          {cadastro && (
            <Callout tone="amber" title="Toda conta criada aqui tem acesso total ao servidor">
              Inclui shell root e exclusão de apps em produção.
            </Callout>
          )}

          {erro && (
            <Callout tone="red" title={erro.titulo}>
              {erro.detalhe}
            </Callout>
          )}

          <form onSubmit={enviar} className="m-0 flex flex-col gap-4" noValidate>
            {cadastro && (
              <Campo id="name" label="Nome" opcional>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  className="h-10"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Campo>
            )}

            <Campo id="email" label="E-mail">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                placeholder="voce@dominio.com"
                className="h-10"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Campo>

            <Campo id="password" label="Senha">
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={verSenha ? 'text' : 'password'}
                  autoComplete={cadastro ? 'new-password' : 'current-password'}
                  required
                  className="h-10 pr-10"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={verSenha}
                  title={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-[4px] text-text-3 transition-colors hover:bg-bg-2 hover:text-text-1 max-xl:size-9"
                >
                  {verSenha ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>

              {cadastro && (
                <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 pt-1">
                  {forca.map((r) => (
                    <li key={r.id} className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          'block size-1.5 shrink-0 rounded-full',
                          r.atende ? 'bg-accent' : 'border border-text-3',
                        )}
                      />
                      <span className={cn('text-xs leading-4', r.atende ? 'text-text-2' : 'text-text-3')}>
                        {r.label}
                        <span className="sr-only">{r.atende ? ' — atendido' : ' — pendente'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Campo>

            {cadastro && (
              <Campo
                id="secret"
                label="Chave de registro"
                hint="Definida em REGISTRATION_SECRET no backend/.env."
                erro={erroSecret}
              >
                <Input
                  id="secret"
                  name="registration_secret"
                  type="password"
                  autoComplete="off"
                  required
                  aria-invalid={Boolean(erroSecret)}
                  value={form.secret}
                  onChange={(e) => setForm({ ...form, secret: e.target.value })}
                  className={cn('h-10 font-mono tabular-nums text-[12.5px]', erroSecret && 'border-red')}
                />
              </Campo>
            )}

            {/*
              Grade 1fr/auto/1fr: o rótulo fica opticamente centrado mesmo com a tecla
              encostada na direita. Centralizar com `justify-center` empurraria o texto.
            */}
            <Button
              type="submit"
              variant="primary"
              disabled={enviando}
              aria-busy={enviando ? 'true' : undefined}
              className="grid h-10 w-full grid-cols-[1fr_auto_1fr] px-2 max-xl:h-12"
            >
              <span aria-hidden />
              <span className="flex items-center gap-1.5">
                {enviando && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                {enviando ? 'Enviando…' : cadastro ? 'Criar conta' : 'Entrar'}
              </span>
              <span className="justify-self-end max-xl:hidden">
                <Kbd tone="on-primary">
                  <KbdEnter />
                </Kbd>
              </span>
            </Button>
          </form>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={trocarModo}
                className="inline-flex h-6 items-center gap-1.5 self-start text-[13px] font-medium leading-5 text-text-1 transition-colors hover:text-accent"
              >
                {cadastro ? 'Já tenho conta · Entrar' : 'Criar conta'}
                <ArrowRight className="size-3 text-text-3" aria-hidden />
              </button>
              {!cadastro && (
                <p className="m-0 text-xs leading-4 text-text-3">
                  O cadastro exige a chave de registro do servidor.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-line-1 pt-4 font-mono tabular-nums text-xs leading-[18px]">
              <span
                aria-hidden
                className={cn(
                  'block size-2 shrink-0 rounded-full',
                  api.estado === 'ok' ? 'bg-accent' : api.estado === 'falhou' ? 'bg-red' : 'bg-text-3',
                )}
              />
              <span className={api.estado === 'falhou' ? 'text-red' : 'text-text-2'}>
                {api.estado === 'ok' ? 'Server online' : api.estado === 'falhou' ? 'API sem resposta' : 'Verificando…'}
              </span>
              {api.latencia !== null && (
                <>
                  <span className="text-text-3" aria-hidden>
                    ·
                  </span>
                  <span className="text-text-3">
                    API <span className="text-text-1">{api.latencia}</span> ms
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/*
        Painel de prova de vida. O board mostra os últimos deploys aqui, mas o histórico
        exige autenticação — e inventar três linhas plausíveis numa tela de login seria
        exatamente o tipo de dado falso que o resto do refactor removeu. O painel mantém
        a composição e diz a verdade sobre o que falta.
      */}
      <aside
        aria-labelledby="painel-titulo"
        className="hidden w-[560px] shrink-0 flex-col justify-center border-l border-line-1 px-20 xl:flex 2xl:w-[720px] 2xl:px-32"
      >
        <section className="overflow-hidden rounded-[8px] border border-line-2 bg-bg-0">
          <header className="flex h-9 items-center gap-2 border-b border-line-1 bg-bg-1 px-3">
            <h2 id="painel-titulo" className="m-0 font-mono text-xs font-medium leading-[18px] text-text-2">
              últimos deploys
            </h2>
            <span className="min-w-0 flex-1" />
            <span className="whitespace-nowrap font-mono tabular-nums text-xs leading-[18px] text-text-3">
              horário do servidor (UTC)
            </span>
          </header>

          <div className="flex flex-col gap-1 px-3 py-4">
            <p className="m-0 font-mono text-xs leading-[18px] text-text-2">
              Disponível depois de entrar.
            </p>
            <p className="m-0 font-mono text-xs leading-[18px] text-text-3">
              O histórico de deploys exige autenticação — não há endpoint público que o exponha.
            </p>
          </div>
        </section>

        <p className="m-0 pt-4 text-xs leading-4 text-text-3">
          Apps, releases, logs e terminal num lugar só. Toda conta deste painel administra o servidor
          inteiro.
        </p>
      </aside>
    </div>
  );
}

function Campo({
  id,
  label,
  hint,
  erro,
  opcional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  erro?: string | null;
  opcional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <Label htmlFor={id}>{label}</Label>
        {opcional && <span className="text-xs text-text-3">opcional</span>}
      </span>
      {children}
      {erro ? (
        <p className="m-0 text-xs leading-4 text-red">{erro}</p>
      ) : hint ? (
        <p className="m-0 text-xs leading-4 text-text-3">{hint}</p>
      ) : null}
    </div>
  );
}
