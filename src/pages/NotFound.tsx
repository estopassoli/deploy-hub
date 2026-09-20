import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd, KbdCmd } from '@/components/ds/kbd';
import { useFleetContext } from '@/components/shell/FleetContext';

/**
 * Rota não encontrada — **dentro do shell**.
 *
 * Antes era uma página solta, fora do shell e fora do `ProtectedRoute`: quem errava a
 * URL perdia a navegação inteira e via um "404 Oops!" em inglês num painel em pt-BR.
 *
 * A rota tentada aparece em Mono, e as sugestões são por similaridade com os apps
 * reais: quase todo 404 aqui é um nome de app digitado errado.
 */
function similares(alvo: string, nomes: string[]): string[] {
  const termo = alvo.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!termo) return [];
  return nomes
    .map((nome) => {
      const limpo = nome.toLowerCase().replace(/[^a-z0-9]/g, '');
      let pontos = 0;
      if (limpo.includes(termo) || termo.includes(limpo)) pontos += 10;
      for (let i = 0; i < Math.min(limpo.length, termo.length); i++) {
        if (limpo[i] === termo[i]) pontos++;
        else break;
      }
      return { nome, pontos };
    })
    .filter((x) => x.pontos > 2)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 3)
    .map((x) => x.nome);
}

export default function NotFound() {
  const { pathname } = useLocation();
  const fleet = useFleetContext();

  const ultimo = pathname.split('/').filter(Boolean).pop() ?? '';
  const sugestoes = similares(ultimo, fleet.apps.map((a) => a.name));

  return (
    <div className="flex max-w-180 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">Esta rota não existe</h1>
        <p className="m-0 text-[13px] leading-5 text-text-2">
          Nada responde por{' '}
          <span className="font-mono tabular-nums text-xs text-text-1">{pathname}</span> neste painel.
        </p>
      </div>

      {sugestoes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">
            Talvez você quisesse
          </h2>
          <ul className="m-0 flex list-none flex-col gap-px p-0">
            {sugestoes.map((nome) => (
              <li key={nome}>
                <Link
                  to={`/apps/${encodeURIComponent(nome)}`}
                  className="flex h-9 items-center gap-2 rounded-md px-2 text-[13px] text-text-2 transition-colors hover:bg-bg-2 hover:text-text-1"
                >
                  <span className="font-medium">{nome}</span>
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" asChild>
          <Link to="/">Ir para a Visão geral</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link to="/buscar">
            <Search aria-hidden />
            Buscar
          </Link>
        </Button>
        <span className="flex items-center gap-1.5 text-xs text-text-3 max-xl:hidden">
          ou
          <Kbd>
            <KbdCmd />K
          </Kbd>
        </span>
      </div>
    </div>
  );
}
