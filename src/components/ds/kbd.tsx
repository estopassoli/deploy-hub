import * as React from 'react';
import { ArrowDown, ArrowUp, Command, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tecla de atalho. Só desktop — nunca em tablet, nunca em celular, nunca em cabeçalho
 * de card. Mora em botão, item de menu, linha da paleta ou no rodapé da lista.
 *
 * ## Por que ⌘ e ↵ são SVG e não caractere
 *
 * U+2318 e U+21B5 não estão no subset do Geist Mono servido pelo Google Fonts. Faltando
 * o glifo, o navegador cai num fallback no meio da tecla: outro peso, outra largura, a
 * pílula de 20px cresce e a legenda sai do alinhamento tabular do rodapé. Em
 * Linux/Windows pode virar tofu. E o leitor de tela anuncia U+2318 como "place of
 * interest sign" — por isso o glifo é `aria-hidden` e quem carrega o nome da tecla é o
 * `aria-label` do botão ("Redeploy de aura (R)").
 */
export function Kbd({
  tone = 'default',
  className,
  children,
}: {
  tone?: 'default' | 'on-primary';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-px rounded-[4px] border px-[5px] font-mono tabular-nums text-2xs leading-none',
        tone === 'on-primary'
          ? 'border-bg-0/[0.14] bg-bg-0/[0.08] text-bg-0'
          : 'border-line-2 bg-bg-2 text-text-2',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export const KbdCmd = () => <Command className="h-[11px] w-[11px]" aria-hidden />;
export const KbdEnter = () => <CornerDownLeft className="h-[11px] w-[11px]" aria-hidden />;
export const KbdUp = () => <ArrowUp className="h-[11px] w-[11px]" aria-hidden />;
export const KbdDown = () => <ArrowDown className="h-[11px] w-[11px]" aria-hidden />;
