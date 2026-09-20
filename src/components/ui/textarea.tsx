import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Área de texto.
 *
 * Mono por padrão: o que sobrou de textarea no produto carrega conteúdo de máquina
 * (YAML de workflow, saída colada). **Nenhum textarea de `.env` sobrevive** — segredo
 * em texto puro virou `ds/EnvTable`, com valor mascarado e revelação explícita.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full rounded-[6px] border border-line-2 bg-bg-1 p-2.5 font-mono tabular-nums text-[12.5px] leading-5 text-text-1 transition-colors",
        "placeholder:text-text-3 hover:border-line-3",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/[0.18] focus-visible:ring-offset-0 focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:text-text-3",
        "max-xl:text-[16px]",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
