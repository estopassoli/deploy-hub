import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Caixa tracejada de estado vazio.
 *
 * **Nunca use vazio para disfarçar erro de carregamento.** Se a requisição falhou, o
 * certo é um `Callout` vermelho com a mensagem e um botão "Tentar de novo" — a tela de
 * GitHub mostrava um `<pre>` vazio para um 400 da API, o que faz o operador procurar o
 * problema no lugar errado.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-line-2 px-6 py-10 text-center',
        className,
      )}
    >
      {icon}
      <span className="text-[13px] leading-5 text-text-1 max-md:text-[15px]">{title}</span>
      {description && (
        <span className="max-w-[46ch] text-xs leading-4 text-text-3 max-md:text-[13px]">{description}</span>
      )}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
