import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Pílula de severidade: `Ready`, `3 stopped`, `1 errored`, `Preview`, `atual`.
 *
 * É uma das **duas** famílias do kit, e misturá-las foi o erro nº 4 do QA. A outra é
 * `ds/Tag`: retângulo neutro de raio 4 com valor de máquina (framework, runtime,
 * branch, hash). Badge é tinta semântica; Tag é neutra.
 *
 * Regra de conteúdo: o badge de gravidade sempre carrega **palavra e número**
 * (`3 stopped`) — nunca uma fração colorida (`1/4 running` em âmbar), que é cor como
 * único sinal.
 */
const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-2xs font-medium leading-4 max-xl:h-6 max-md:text-xs",
  {
    variants: {
      tone: {
        accent: "bg-accent/12 border border-accent/28 text-accent",
        amber: "bg-amber/12 border border-amber/28 text-amber",
        red: "bg-red/12 border border-red/30 text-red",
        blue: "bg-blue/12 border border-blue/28 text-blue",
        neutral: "bg-bg-2 border border-line-2 text-text-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
