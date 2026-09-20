import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Boxes, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EmptyState, StatusDot } from '@/components/ds';
import { useFleetContext } from '@/components/shell/FleetContext';
import { EM_DASH } from '@/lib/format';

/**
 * Busca em tela cheia — a paleta ⌘K do celular.
 *
 * Uma caixa de 560px centrada não funciona em 390px com o teclado aberto, então no
 * telefone a paleta é uma **rota**: entra no histórico, o botão voltar fecha, e um link
 * pode apontar para ela.
 *
 * `?modo=git` vem do item "Git e CI" da sheet "Mais": lá não há tela global, então
 * escolher um app leva direto para a aba dele.
 */
export default function SearchPage() {
  const [params] = useSearchParams();
  const modo = params.get('modo');
  const fleet = useFleetContext();
  const [termo, setTermo] = useState('');

  const sufixo = modo === 'git' ? '/git' : '';

  const apps = useMemo(() => {
    const q = termo.trim().toLowerCase();
    return fleet.apps
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.domain ?? '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [fleet.apps, termo]);

  const projetos = useMemo(() => {
    const q = termo.trim().toLowerCase();
    return fleet.groups.filter((g) => g.projectId && (!q || g.name.toLowerCase().includes(q)));
  }, [fleet.groups, termo]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">
        {modo === 'git' ? 'Git e CI · escolha o app' : 'Buscar'}
      </h1>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" aria-hidden />
        <Input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="App, projeto ou domínio"
          aria-label="Buscar"
          className="pl-9"
        />
      </div>

      {apps.length === 0 && projetos.length === 0 ? (
        <EmptyState title="Nada encontrado" description="Tente outro nome de app, projeto ou domínio." />
      ) : (
        <>
          {apps.length > 0 && (
            <Secao titulo="Apps" contagem={`${apps.length} de ${fleet.apps.length}`}>
              {apps.map((app) => (
                <li key={app.id}>
                  <Link
                    to={`/apps/${encodeURIComponent(app.name)}${sufixo}`}
                    className="flex min-h-14 items-center gap-3 rounded-md px-2 transition-colors hover:bg-bg-2"
                  >
                    <StatusDot status={app.status} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-medium leading-5 text-text-1">{app.name}</span>
                      <span className="truncate font-mono tabular-nums text-[13px] leading-[18px] text-text-3">
                        {app.domain || EM_DASH} :{app.port}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </Secao>
          )}

          {modo !== 'git' && projetos.length > 0 && (
            <Secao titulo="Projetos" contagem={String(projetos.length)}>
              {projetos.map((grupo) => (
                <li key={grupo.id}>
                  <Link
                    to={`/projects/${grupo.projectId}`}
                    className="flex min-h-14 items-center gap-3 rounded-md px-2 transition-colors hover:bg-bg-2"
                  >
                    <Boxes className="size-4 shrink-0 text-text-3" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-medium leading-5 text-text-1">{grupo.name}</span>
                      <span className="font-mono tabular-nums text-[13px] leading-[18px] text-text-3">
                        {grupo.apps.length} services
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </Secao>
          )}
        </>
      )}
    </div>
  );
}

function Secao({ titulo, contagem, children }: { titulo: string; contagem: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-2">
        <h2 className="m-0 text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">{titulo}</h2>
        <span className="font-mono tabular-nums text-2xs text-text-3">{contagem}</span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">{children}</ul>
    </section>
  );
}
