import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Campo de texto.
 *
 * 32px no desktop, **48px e 16px no toque** — o `max-xl:` não é enfeite: 16px é o que
 * impede o iOS de dar zoom ao focar, e a faixa de toque começa em 1279px, não em 767px,
 * porque o tablet de 834px também é dedo.
 *
 * Campo com valor de máquina (repo, domínio, branch, porta, comando) recebe
 * `font-mono tabular-nums text-[12.5px]` por cima.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-8 w-full items-center rounded-[6px] border border-line-2 bg-bg-1 pl-2.5 pr-1 text-[13px] leading-5 text-text-1 transition-colors",
        "placeholder:text-text-3 hover:border-line-3",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/[0.18] focus-visible:ring-offset-0 focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:bg-bg-1 disabled:text-text-3",
        "aria-[invalid=true]:border-red",
        "file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-text-1",
        "max-xl:h-12 max-xl:px-3 max-xl:text-[16px]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
