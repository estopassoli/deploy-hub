import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/**
 * Interruptor: trilho 36×20, knob 16 com 2px de folga, dentro de um alvo de 24px
 * (44 no toque).
 *
 * Sem sombra no knob — elevação existe só em overlay.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      "relative block h-5 w-9 shrink-0 cursor-pointer rounded-full bg-bg-3 transition-colors",
      "data-[state=checked]:bg-accent-strong",
      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/[0.18] focus-visible:ring-offset-0",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-text-2 transition-transform",
        "data-[state=checked]:translate-x-4 data-[state=checked]:bg-bg-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
