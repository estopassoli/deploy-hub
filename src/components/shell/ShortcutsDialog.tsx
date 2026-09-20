import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ds/kbd';
import { KEYBOARD_MAP, SCOPE_LABEL, type KeyScope } from '@/lib/keyboard-map';

/**
 * Tela de atalhos (`?`).
 *
 * Renderizada a partir de `lib/keyboard-map.ts` — a mesma constante que alimenta o
 * handler global e os `Kbd` dos botões. Uma tabela escrita à mão divergiria do
 * comportamento real na primeira mudança.
 */
const ESCOPOS: KeyScope[] = ['global', 'lists', 'app', 'sequence'];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px]">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>Disponíveis no desktop. No tablet e no celular, use os botões.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          {ESCOPOS.map((escopo) => {
            const lista = KEYBOARD_MAP.filter((k) => k.scope === escopo);
            if (!lista.length) return null;
            return (
              <section key={escopo} className="flex flex-col gap-1.5">
                <h3 className="m-0 text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">
                  {SCOPE_LABEL[escopo]}
                </h3>
                <dl className="m-0 flex flex-col gap-1">
                  {lista.map((k) => (
                    <div key={k.keys} className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-4">
                      <dt className="flex">
                        <Kbd>{k.keys}</Kbd>
                      </dt>
                      <dd className="m-0 text-[13px] leading-5 text-text-2">{k.action}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
