import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Callout } from '@/components/ds/callout';
import { HubMark } from '@/components/shell/HubMark';

/**
 * Login e criação de conta.
 *
 * ## Erro inline, nunca toast
 *
 * O interceptor de 401 redirecionava para `/login` em **qualquer** 401, inclusive no
 * próprio `POST /auth/login`. Senha errada recarregava a página inteira antes de o
 * `catch` do formulário rodar: a tela só piscava e o erro nunca aparecia (o conserto
 * mora em `lib/api.ts`). Aqui o erro é um callout persistente acima do CTA, com o que
 * fazer a respeito.
 *
 * ## O modo vive na URL
 *
 * `?modo=cadastro` em vez de `useState`: o botão voltar do navegador volta ao login em
 * vez de sair do app, o reload preserva o modo, e alternar não apaga o que já foi
 * digitado.
 *
 * ## Senha visível por padrão no cadastro
 *
 * Toda conta criada aqui é administradora total de um servidor que ainda por cima
 * oferece shell root, e não existe recuperação de senha. Um campo mascarado, sem
 * confirmação e sem medidor é a receita para uma senha digitada errado que ninguém
 * consegue recuperar.
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

  const cadastro = params.get('modo') === 'cadastro';
  const destino = params.get('de') || '/';

  const [form, setForm] = useState({ email: '', password: '', name: '', secret: '' });
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
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
      // 403 do registro vem com a chave errada: o erro pertence ao campo, não à tela.
      if (cadastro && /secret|chave|registro|403/i.test(mensagem)) {
        setErroSecret('Chave de registro inválida.');
      } else if (/401|credenciais|unauthorized|senha/i.test(mensagem)) {
        setErro('E-mail ou senha incorretos.');
      } else {
        setErro(mensagem);
      }
    } finally {
      setEnviando(false);
    }
  };

  const trocarModo = () => {
    const proximo = new URLSearchParams(params);
    if (cadastro) proximo.delete('modo');
    else proximo.set('modo', 'cadastro');
    setParams(proximo, { replace: false });
    setErro(null);
    setErroSecret(null);
  };

  return (
    <div className="grid min-h-viewport grid-cols-1 bg-bg-0 text-text-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main className="flex items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-90 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="flex items-center gap-2.5">
              <span className="flex size-6 items-center justify-center rounded-md bg-accent-strong text-bg-0">
                <HubMark className="size-[18px]" />
              </span>
              <span className="text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">DeployHub</span>
            </span>
            <div className="flex flex-col gap-1">
              <h1 className="m-0 text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">
                {cadastro ? 'Criar conta' : 'Entrar no painel'}
              </h1>
              <p className="m-0 font-mono tabular-nums text-xs leading-4 text-text-3">
                {window.location.host}
              </p>
            </div>
          </div>

          {cadastro && (
            <Callout tone="amber" title="Toda conta criada aqui tem acesso total ao servidor">
              Inclui shell root e exclusão de apps em produção.
            </Callout>
          )}

          {erro && (
            <Callout tone="red" title={erro}>
              {erro.startsWith('E-mail ou senha')
                ? 'Confira o endereço e tente de novo.'
                : 'Se o problema persistir, verifique se a API está no ar.'}
            </Callout>
          )}

          <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
            {cadastro && (
              <Campo id="name" label="Nome" opcional>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
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
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-text-3 transition-colors hover:text-text-1 max-xl:size-10"
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
                  className={cn('font-mono tabular-nums text-[12.5px]', erroSecret && 'border-red')}
                />
              </Campo>
            )}

            <Button
              type="submit"
              variant="primary"
              size="touch"
              className="w-full"
              disabled={enviando}
              aria-busy={enviando ? 'true' : undefined}
            >
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              {enviando ? 'Enviando…' : cadastro ? 'Criar conta' : 'Entrar'}
            </Button>
          </form>

          <div className="flex flex-col gap-2">
            <Button variant="secondary" size="touch" className="w-full" onClick={trocarModo}>
              {cadastro ? 'Já tenho conta · Entrar' : 'Criar conta'}
            </Button>
            {!cadastro && (
              <p className="m-0 text-xs leading-4 text-text-3">
                O cadastro exige a chave de registro do servidor.
              </p>
            )}
          </div>
        </div>
      </main>

      {/*
        Painel de prova de vida: um endereço e uma marca não dizem se a API está no ar.
        Ele é decorativo no celular e some abaixo da dobra — por isso não carrega
        informação que só exista aqui.
      */}
      <aside className="hidden flex-col justify-center gap-4 border-l border-line-1 bg-bg-1 px-10 xl:flex">
        <p className="m-0 max-w-96 text-[13px] leading-5 text-text-2">
          Painel de deploy do servidor: apps, releases, logs e terminal num lugar só. Toda conta
          aqui administra o servidor inteiro.
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
