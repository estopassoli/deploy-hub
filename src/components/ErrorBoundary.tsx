import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Callout } from '@/components/ds/callout';
import { Button } from '@/components/ui/button';

/**
 * Última linha de defesa contra tela branca.
 *
 * Sem isto, uma exceção durante o render deixa o `#root` vazio: o usuário vê fundo
 * preto e nenhuma pista, e a única saída é abrir o console. Foi exatamente o que
 * aconteceu quando o breadcrumb passou a exigir um contexto que ainda não existia.
 *
 * A mensagem do erro aparece na tela **de propósito**: este é um painel de operação
 * rodando numa rede interna, e quem vai ler é quem administra o servidor. Esconder o
 * erro aqui só transferiria o trabalho para o console.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // O console segue sendo o lugar do stack completo; a tela mostra o resumo.
    console.error('Erro de render:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-viewport items-start justify-center bg-bg-0 px-8 py-24 text-text-1">
        <div className="flex w-full max-w-180 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">
              Erro na interface
            </span>
            <h1 className="m-0 text-xl font-semibold leading-7 tracking-[-0.02em] text-text-1">
              A tela não conseguiu renderizar
            </h1>
          </div>

          <Callout tone="red" title={error.message || 'Erro desconhecido'}>
            O servidor e os apps não foram afetados — isto é um erro do painel, no navegador.
          </Callout>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => this.setState({ error: null })}>
              Tentar renderizar de novo
            </Button>
            <Button variant="secondary" onClick={() => window.location.assign('/')}>
              Ir para a Visão geral
            </Button>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
          </div>

          {error.stack && (
            <details className="rounded-[8px] border border-line-2 bg-bg-1 p-3">
              <summary className="cursor-pointer text-[13px] text-text-2">Detalhes técnicos</summary>
              <pre className="terminal-scroll m-0 mt-2 max-h-64 overflow-auto font-mono text-2xs leading-5 text-text-3">
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
