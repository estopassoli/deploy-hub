import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

/**
 * Bottom sheet do celular.
 *
 * Toda ação de linha, todo menu e todo diálogo do celular passam por aqui. É o que
 * substitui o kebab que ficava fora da tela em 390px (a linha tinha `scrollWidth` 486).
 *
 * Itens de 48px, destrutivo separado e por último, 24px de safe-area no fim.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col overflow-auto rounded-t-2xl bg-bg-1 px-4 pb-6 pt-2 shadow-overlay',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          )}
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex justify-center pb-3">
            <span aria-hidden className="block h-1 w-9 rounded-full bg-bg-3" />
          </div>
          <div className="flex flex-col gap-0.5 px-1 pb-3">
            <DialogPrimitive.Title className="m-0 flex items-center gap-2 text-[15px] font-semibold leading-[22px] text-text-1">
              {title}
            </DialogPrimitive.Title>
            {subtitle && (
              <DialogPrimitive.Description className="m-0 font-mono tabular-nums text-[13px] leading-[18px] text-text-3">
                {subtitle}
              </DialogPrimitive.Description>
            )}
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Item de 48px do sheet. */
export function SheetItem({
  icon,
  onSelect,
  destructive,
  children,
}: {
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-[8px] px-1 text-left text-[15px] font-medium leading-5 transition-colors',
        destructive ? 'text-red hover:bg-red/12' : 'text-text-1 hover:bg-bg-2',
      )}
    >
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center', destructive ? 'text-red' : 'text-text-2')}>
        {icon}
      </span>
      {children}
    </button>
  );
}

export function SheetSeparator() {
  return (
    <div aria-hidden className="py-2">
      <div className="h-px bg-line-1" />
    </div>
  );
}
