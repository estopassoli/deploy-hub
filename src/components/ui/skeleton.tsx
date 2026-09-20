import { cn } from "@/lib/utils";

/**
 * Bloco de carregamento.
 *
 * Sem `animate-pulse`: o kit não tem animação decorativa, e um pulso em cada bloco de
 * uma lista de 21 itens é ruído — ainda mais para quem usa `prefers-reduced-motion`.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[6px] bg-bg-2", className)} {...props} />;
}

export { Skeleton };
