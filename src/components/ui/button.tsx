import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Botão do kit.
 *
 * O cva antigo tinha uma variante `gradient` (teal→cyan com glow) usada em 19 CTAs, que
 * violava quatro regras de uma vez: gradiente, glow, mais de um primário por tela e
 * acento fora de "vivo/foco/selecionado". Foram removidas também `glass`, `success` e
 * `link`, todas com zero usos.
 *
 * ## Um primário por tela
 *
 * `primary` é #EDEDEF sobre #0A0A0B — a única inversão do sistema. **Não** é a cor de
 * marca: o emerald só significa vivo, foco e selecionado.
 *
 * ## Dois tamanhos de botão de ícone no desktop
 *
 * 28px (`icon-xs`) dentro de linha de tabela ou lista; 32px (`icon`) em cabeçalho e
 * toolbar. No toque tudo vai a 44px. O `size="sm"` de 36px saiu de propósito: renomear
 * força o TypeScript a apontar cada call site em vez de deixá-los silenciosamente
 * pequenos demais.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px]",
    "font-sans text-[13px] font-medium leading-5 transition-colors",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/[0.18] focus-visible:ring-offset-0 focus-visible:border-accent",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:border disabled:border-line-1 disabled:bg-bg-1 disabled:text-text-3",
    "[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // UM por tela. #EDEDEF sobre #0A0A0B.
        primary: "border-0 bg-text-1 text-bg-0 hover:bg-white",
        secondary: "border border-line-2 bg-bg-1 text-text-1 hover:border-line-3",
        ghost: "border-0 bg-transparent text-text-2 hover:bg-bg-2 hover:text-text-1",
        // ação destrutiva em tela normal
        destructive: "border border-red/30 bg-transparent text-red hover:bg-red/12",
        // SÓ dentro de diálogo de confirmação
        "destructive-solid": "border-0 bg-red-solid text-white hover:brightness-110",
      },
      size: {
        xs: "h-7 px-2.5 text-xs leading-4",      // 28 — faixa de grupo ("Start 3")
        default: "h-8 px-3",                      // 32 — padrão do desktop
        page: "h-9 px-3.5",                       // 36 — ação principal de página
        touch: "h-11 px-4 text-[15px]",           // 44 — tablet e celular
        block: "h-12 w-full px-4 text-[15px]",    // 48 — empilhado em sheet/diálogo
        "icon-xs": "h-7 w-7 p-0",                 // 28 — dentro de linha
        icon: "h-8 w-8 p-0",                      // 32 — cabeçalho/toolbar
        "icon-touch":
          "h-11 w-11 rounded-[8px] p-0 [&_svg]:size-[18px] [&_svg]:[stroke-width:1.75]",
      },
      // botão que carrega Kbd à direita: padding assimétrico do shell
      withKbd: { true: "gap-2 pl-2.5 pr-1.5", false: "" },
    },
    defaultVariants: { variant: "secondary", size: "default", withKbd: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/** Tamanhos em que o botão não tem rótulo visível. */
const SO_ICONE = new Set(["icon-xs", "icon", "icon-touch"]);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, withKbd, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    /*
     * Botão só de ícone recebe `title` a partir do `aria-label`.
     *
     * O `aria-label` já era obrigatório e já nomeia o alvo e a tecla ("Logs de aura
     * (L)"), mas ele só existe para o leitor de tela: quem enxerga ficava adivinhando
     * o que cada ícone de 28px faz. Derivar o title do label garante que os dois nunca
     * divirjam, e funciona mesmo quando o botão é gatilho de um menu ou diálogo do
     * Radix — onde embrulhar num Tooltip quebraria a cadeia de refs.
     *
     * Um `title` explícito (inclusive `""`, usado por `ds/IconButton` para ceder a vez
     * ao tooltip estilizado) tem precedência.
     */
    const rotulo = typeof props["aria-label"] === "string" ? props["aria-label"] : undefined;
    const title = props.title !== undefined ? props.title : SO_ICONE.has(size ?? "") ? rotulo : undefined;

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, withKbd, className }))}
        {...props}
        title={title}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
