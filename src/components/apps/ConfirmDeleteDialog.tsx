import { ReactNode, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Confirmação de exclusão que exige digitar o nome.
 *
 * ## Por quê
 *
 * A lixeira vermelha ficava ao lado de "Redeploy", com um AlertDialog de um clique.
 * Excluir um app aqui **não** é reversível: para o processo, remove os containers e as
 * imagens, apaga o vhost do Nginx, o `/var/www/<app>` e o `~/apps/<app>` inteiro — com
 * todas as releases e o histórico. Um clique errado na lixeira do app errado é um
 * incidente de produção.
 *
 * Digitar o nome força a pessoa a ler qual app está prestes a sumir.
 */

interface ConfirmDeleteDialogProps {
  /** Nome que precisa ser digitado. */
  name: string;
  title?: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  /** Gatilho customizado; o default é um botão de lixeira. */
  trigger?: ReactNode;
  disabled?: boolean;
  /**
   * Modo controlado, para quando o gatilho é um item de menu que já fecha sozinho
   * (o AppCard abre a confirmação a partir do menu "…").
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ConfirmDeleteDialog({
  name,
  title,
  description,
  confirmLabel = 'Excluir',
  onConfirm,
  trigger,
  disabled,
  open: controlledOpen,
  onOpenChange,
}: ConfirmDeleteDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const matches = typed.trim() === name;

  const handleConfirm = async () => {
    if (!matches || working) return;
    setWorking(true);
    try {
      await onConfirm();
      setOpen(false);
      setTyped('');
    } finally {
      setWorking(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped('');
      }}
    >
      {/* No modo controlado não há gatilho: quem abre é o menu de fora. */}
      {!isControlled && (
        <AlertDialogTrigger asChild disabled={disabled}>
          {trigger ?? (
            <Button
             
              variant="secondary"
              className="text-destructive hover:text-destructive"
              disabled={disabled}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </AlertDialogTrigger>
      )}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? `Excluir ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm-name" className="text-sm">
            Digite <span className="font-mono text-foreground">{name}</span> para confirmar
          </Label>
          <Input
            id="confirm-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
            }}
            placeholder={name}
            autoComplete="off"
            className="font-mono"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!matches || working}
            onClick={handleConfirm}
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
