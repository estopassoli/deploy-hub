import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Contêiner de região. **Um nível com borda por região** — sem card dentro de card.
 *
 * O painel tinha 24 cards colados à mão (nenhum importava este arquivo) e um deles
 * aninhava uma caixa de log bordeada dentro de um card bordeado: duas hairlines
 * paralelas, densidade perdida.
 *
 * `CardTitle` deixou de ser `text-2xl` — 24px era o dobro do permitido num cabeçalho de
 * card, e era isso que empurrava a página de app para 5848px.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col rounded-[8px] border border-line-2 bg-bg-1", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/** Cabeçalho de 44px: título à esquerda e **no máximo um** item à direita. */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex min-h-11 items-center gap-3 border-b border-line-1 px-4 py-3 max-md:px-3.5 max-md:py-2.5",
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn(
        "m-0 whitespace-nowrap text-sm font-semibold leading-5 tracking-[-0.005em] text-text-1",
        className,
      )}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("m-0 text-xs leading-4 text-text-3", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 max-md:p-3.5", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-2 border-t border-line-1 px-4 py-3 max-md:px-3.5", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
