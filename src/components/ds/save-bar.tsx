import * as React from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd, KbdCmd } from './kbd';

/**
 * Barra de estado sujo.
 *
 * Resolve o achado "alterações não salvas se perdem em silêncio; 'Deploy service' roda
 * com a config antiga": o formulário nunca mais fica alterado sem dizer.
 *
 * Quando salvar exige rebuild, o primário é **Salvar e fazer redeploy** e o secundário
 * **Salvar** — nunca dois primários na mesma barra.
 */
export function SaveBar({
  dirtyCount,
  saving,
  onDiscard,
  onSave,
  saveLabel = 'Salvar',
  secondary,
}: {
  dirtyCount: number;
  saving?: boolean;
  onDiscard: () => void;
  onSave: () => void;
  saveLabel?: string;
  /** Ação alternativa (ex.: "Salvar" quando o primário é "Salvar e fazer redeploy"). */
  secondary?: React.ReactNode;
}) {
  if (dirtyCount <= 0) return null;

  return (
    <div className="sticky bottom-0 z-10 flex h-14 items-center gap-3 border-t border-line-2 bg-bg-1 px-8 max-md:h-16 max-md:px-4">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px] leading-5 text-text-2 max-md:text-[15px]">
        <Pencil className="h-3.5 w-3.5 shrink-0 text-text-3" aria-hidden />
        <span className="truncate">
          Alterações não salvas · {dirtyCount} {dirtyCount === 1 ? 'campo' : 'campos'}
        </span>
      </span>
      <Button variant="ghost" onClick={onDiscard} disabled={saving} className="max-xl:h-11 max-md:text-[15px]">
        Descartar
      </Button>
      {secondary}
      <Button
        variant="primary"
        withKbd
        onClick={onSave}
        aria-busy={saving ? 'true' : undefined}
        className="max-xl:h-11 max-md:text-[15px]"
      >
        {saving && <Loader2 className="animate-spin" aria-hidden />}
        {saving ? 'Salvando…' : saveLabel}
        <span className="max-xl:hidden">
          <Kbd tone="on-primary">
            <KbdCmd />S
          </Kbd>
        </span>
      </Button>
    </div>
  );
}
