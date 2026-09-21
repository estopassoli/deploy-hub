import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Barra que aparece quando há itens selecionados numa tabela.
 *
 * Fica presa no topo da lista, e não no rodapé da página: com 30 releases, uma barra
 * no fim obrigaria a rolar até lá depois de marcar uma caixa no começo.
 *
 * A contagem é sempre a de itens **elegíveis** — a linha que está em produção nem
 * chega a ter caixa, então nunca entra no número nem na ação.
 */
export function SelectionBar({
  count,
  onClear,
  children,
  className,
}: {
  count: number;
  onClear: () => void;
  /** As ações em lote. */
  children: React.ReactNode;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label={`${count} selecionada(s)`}
      className={cn(
        'sticky top-0 z-10 flex items-center gap-3 rounded-[8px] border border-accent/28 bg-accent/12 px-3 py-2',
        className,
      )}
    >
      <span className="text-[13px] font-medium leading-5 text-text-1">
        {count} {count === 1 ? 'release selecionada' : 'releases selecionadas'}
      </span>
      <span className="min-w-0 flex-1" />
      {children}
      <Button variant="ghost" size="icon-xs" aria-label="Limpar seleção" onClick={onClear}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
