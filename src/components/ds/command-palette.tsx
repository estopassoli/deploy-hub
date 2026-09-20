import * as React from 'react';
import { Command } from 'cmdk';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd, KbdEnter } from './kbd';
import { StatusDot, type Status } from './status';

/**
 * Paleta de comandos (⌘K).
 *
 * Busca única de apps, projetos e ações. No celular vira uma página de busca em tela
 * cheia — uma paleta de 560px centrada não funciona em 390px com teclado aberto.
 *
 * A pílula de seleção é a mesma da tabela (2×20 accent): um só vocabulário de seleção
 * no produto inteiro.
 */

export interface PaletteItem {
  id: string;
  group: string;
  label: string;
  /** `auraai.chat :3000 · Errored`. Mono, truncável, com `title`. */
  detail?: string;
  status?: Status;
  icon?: React.ReactNode;
  keywords?: string;
  onSelect: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = 'Buscar app, projeto ou ação…',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  placeholder?: string;
}) {
  const grupos = React.useMemo(() => {
    const mapa = new Map<string, PaletteItem[]>();
    for (const item of items) {
      const lista = mapa.get(item.group) ?? [];
      lista.push(item);
      mapa.set(item.group, lista);
    }
    return [...mapa.entries()];
  }, [items]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          aria-label="Paleta de comandos"
          className={cn(
            'fixed left-1/2 top-[18vh] z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-[12px] bg-bg-1 shadow-overlay',
            'max-md:inset-0 max-md:top-0 max-md:max-w-none max-md:translate-x-0 max-md:rounded-none',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Paleta de comandos</DialogPrimitive.Title>
          <Command loop className="flex max-h-[min(560px,70vh)] flex-col max-md:max-h-none max-md:h-full">
            <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line-1 px-3.5">
              <Search className="h-4 w-4 shrink-0 text-text-3" aria-hidden />
              <Command.Input
                placeholder={placeholder}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] leading-6 text-text-1 outline-none placeholder:text-text-3"
              />
              <span className="max-xl:hidden">
                <Kbd>Esc</Kbd>
              </span>
            </div>

            <Command.List className="terminal-scroll flex-1 overflow-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-[13px] leading-5 text-text-3">
                Nada encontrado.
              </Command.Empty>

              {grupos.map(([nome, lista]) => (
                <Command.Group
                  key={nome}
                  heading={
                    <span className="flex items-center gap-2 px-1 pb-1 pt-2">
                      <span className="text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">
                        {nome}
                      </span>
                      <span className="font-mono tabular-nums text-2xs leading-4 text-text-3">
                        {lista.length} de {items.length}
                      </span>
                    </span>
                  }
                >
                  {lista.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${item.detail ?? ''} ${item.keywords ?? ''}`}
                      onSelect={() => {
                        onOpenChange(false);
                        item.onSelect();
                      }}
                      className={cn(
                        'relative grid h-9 cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[6px] px-3',
                        'data-[selected=true]:bg-bg-3 max-xl:h-11',
                      )}
                    >
                      <span
                        aria-hidden
                        className="absolute left-0 top-2 hidden h-5 w-0.5 rounded-full bg-accent [[data-selected=true]>&]:block"
                      />
                      {item.status ? <StatusDot status={item.status} /> : item.icon}
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="whitespace-nowrap text-[13px] font-medium leading-5 text-text-1 max-md:text-[15px]">
                          {item.label}
                        </span>
                        {item.detail && (
                          <span
                            title={item.detail}
                            className="min-w-0 truncate whitespace-nowrap font-mono tabular-nums text-xs leading-[18px] text-text-2"
                          >
                            {item.detail}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5 max-xl:hidden">
                        <span className="text-xs text-text-2">abrir</span>
                        <Kbd>
                          <KbdEnter />
                        </Kbd>
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Liga o ⌘K/Ctrl+K globalmente. Ignora quando o foco está num campo. */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return { open, setOpen };
}
