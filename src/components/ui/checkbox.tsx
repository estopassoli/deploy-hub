import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Caixa de 16px dentro de um alvo de 24px (44 no toque).
 *
 * A separação entre a caixa desenhada e a área clicável é o ponto: uma caixa de 16px
 * como alvo é pequena demais para o dedo, e aumentar a caixa quebraria o alinhamento
 * com a linha de 44px da tabela.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer grid size-6 shrink-0 place-items-center rounded-[4px] bg-transparent max-xl:size-11",
      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/[0.18]",
      "disabled:cursor-not-allowed disabled:opacity-40",
      className,
    )}
    {...props}
  >
    <span
      aria-hidden
      className={cn(
        "flex size-4 items-center justify-center rounded-[4px] border border-line-3 bg-bg-1 transition-colors",
        "peer-data-[state=checked]:border-0",
        "[[data-state=checked]>&]:border-0 [[data-state=checked]>&]:bg-accent-strong [[data-state=checked]>&]:text-bg-0",
        "[[data-state=indeterminate]>&]:border-0 [[data-state=indeterminate]>&]:bg-accent-strong [[data-state=indeterminate]>&]:text-bg-0",
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {props.checked === "indeterminate" ? (
          <Minus className="size-3" strokeWidth={3} aria-hidden />
        ) : (
          <Check className="size-3" strokeWidth={3} aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </span>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
