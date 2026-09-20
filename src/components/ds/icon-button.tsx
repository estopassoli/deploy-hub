import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd } from './kbd';

/**
 * Botão só de ícone com tooltip do kit.
 *
 * O `Button` já deriva um `title` nativo do `aria-label`, o que cobre qualquer ícone
 * do produto — inclusive os que são gatilho de menu ou diálogo do Radix, onde
 * embrulhar num Tooltip quebraria a cadeia de refs. Este componente é para os botões
 * **soltos**, onde vale a pena ter o tooltip estilizado: aparece na hora, com a
 * tipografia do kit, e pode mostrar a tecla de atalho.
 *
 * `title=""` desliga o nativo para os dois não aparecerem juntos.
 */
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'title'> {
  /** Vira o `aria-label` e o texto do tooltip. Inclua o alvo: "Logs de aura". */
  label: string;
  /** Tecla mostrada à direita do tooltip, só no desktop. */
  shortcut?: string;
  icon: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, shortcut, icon, variant = 'ghost', size = 'icon-xs', ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} variant={variant} size={size} aria-label={label} title="" {...props}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  ),
);
IconButton.displayName = 'IconButton';
