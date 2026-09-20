import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * Redireciona as páginas globais antigas para a aba do app.
 *
 * `/versions?app=X` e `/github?app=X` eram páginas com um `<select>` de app. O defeito
 * não era estético: o contexto vivia em `useState` e a tela **sempre** reselecionava o
 * primeiro app da lista, ignorando o `?app=`. Na prática, "Releases e rollback" de um
 * card abria as releases de outro app — com os botões de Rollback ativos.
 *
 * Preservar o parâmetro aqui é o que faz um link antigo, salvo por alguém, continuar
 * levando ao lugar certo.
 */
export function LegacyAppRedirect({ tab }: { tab: 'deployments' | 'git' }) {
  const [params] = useSearchParams();
  const app = params.get('app');
  return <Navigate replace to={app ? `/apps/${encodeURIComponent(app)}/${tab}` : '/deployments'} />;
}
