import { Bell, ChevronsUpDown, Keyboard, LogOut, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ds/kbd';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Linha da conta, no pé da sidebar.
 *
 * ## Dois defeitos que isto corrige
 *
 * - **Nome e e-mail truncados.** A linha dividia 224px com um avatar e *três* botões de
 *   ícone; sobrava espaço para `Adm…` e `admin…`. Os três botões saíram para dentro do
 *   menu e o texto voltou a caber.
 * - **Sair sem guarda.** Era um ícone de 32px colado nos sinos, a um clique acidental
 *   de distância. Agora é o último item do menu, depois de um separador.
 */
export function AccountRow({ onShortcuts }: { onShortcuts?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const nome = user?.name || 'Administrador';
  const iniciais = nome
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Conta: ${nome}`}
          className="flex h-[52px] shrink-0 items-center gap-2.5 border-t border-line-1 px-4 text-left transition-colors hover:bg-bg-2 data-[state=open]:bg-bg-3"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-3 text-2xs font-medium text-text-2">
            {iniciais}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium leading-[18px] text-text-1">{nome}</span>
            <span className="truncate font-mono text-2xs leading-[14px] text-text-3">{user?.email}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-text-3" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-62">
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <span className="truncate text-[13px] font-medium leading-5 text-text-1">{nome}</span>
          <span className="truncate font-mono text-2xs leading-4 text-text-3">{user?.email}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Bell aria-hidden />
          Preferências de notificação
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onShortcuts?.()}>
          <Keyboard aria-hidden />
          Atalhos de teclado
          <span className="ml-auto">
            <Kbd>?</Kbd>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Moon aria-hidden />
          Tema · Escuro
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={logout}>
          <LogOut aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
