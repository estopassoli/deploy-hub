import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toast.
 *
 * ## Dois bugs corrigidos aqui
 *
 * 1. **Tema resolvido pelo SO.** O arquivo lia `useTheme()` de `next-themes`, mas não
 *    existe `ThemeProvider` em lugar nenhum do app — então `theme` caía em `"system"` e
 *    o Sonner resolvia pelo `prefers-color-scheme`. Num SO claro, o painel escuro
 *    servia toast branco. O produto tem um tema só: `dark`, fixo.
 * 2. **Sombra.** Toast não é overlay; elevação existe só em menu, popover, diálogo,
 *    sheet e paleta.
 *
 * Posição: canto inferior direito no desktop, topo em largura total no celular.
 */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="dark"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          "group toast w-[360px] rounded-[8px] border border-line-2 bg-bg-1 p-3 shadow-none max-md:w-full",
        title: "text-[13px] font-medium text-text-1",
        description: "text-xs text-text-2",
        actionButton: "text-xs font-medium text-text-1",
        cancelButton: "text-xs text-text-2",
      },
    }}
    {...props}
  />
);

export { Toaster, toast };
