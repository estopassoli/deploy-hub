import * as React from 'react';
import { Copy, Eye, EyeOff, FileInput, Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TH } from './data-table';
import { Tag } from './tag';

/**
 * Editor de variáveis de ambiente em tabela.
 *
 * ## Por que não é textarea
 *
 * Havia seis textareas de `.env` em texto puro espalhadas pelo painel — a auditoria
 * classificou como severidade alta: segredo legível na tela, no DOM e em qualquer
 * captura. Aqui o valor é `••••••••` por padrão; revelar é ação explícita e copiar
 * funciona **sem** revelar.
 *
 * ## Duas variantes, e o motivo da diferença
 *
 * | contexto | colunas |
 * |---|---|
 * | app existente | KEY · •••• · Origem · olho + copiar + lixeira |
 * | dentro de `/new` | KEY · •••• · olho + lixeira |
 *
 * No fluxo de criação não existe copiar: o valor ainda não foi gravado em lugar nenhum,
 * então o botão copiaria o que o próprio usuário acabou de digitar.
 */
export interface EnvRow {
  key: string;
  value: string;
  /** `App`, `Project`, `Preset`… Ausente na variante de criação. */
  origin?: string;
  /** Herdada do project: informativa, não editável aqui. */
  inherited?: boolean;
}

const GRID_FULL = 'grid-cols-[240px_minmax(0,1fr)_132px_92px]';
const GRID_CREATE = 'grid-cols-[240px_minmax(0,1fr)_92px]';
const GRID_MOBILE = 'max-md:grid-cols-[minmax(0,1fr)_92px]';

export function EnvTable({
  rows,
  variant = 'full',
  onAdd,
  onPaste,
  onRemove,
  onCopy,
  note,
}: {
  rows: EnvRow[];
  variant?: 'full' | 'create';
  onAdd?: () => void;
  onPaste?: () => void;
  onRemove?: (key: string) => void;
  onCopy?: (row: EnvRow) => void;
  note?: React.ReactNode;
}) {
  const [revealed, setRevealed] = React.useState<Set<string>>(new Set());
  const grid = cn(variant === 'full' ? GRID_FULL : GRID_CREATE, GRID_MOBILE);

  const toggle = (key: string) =>
    setRevealed((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(key)) proximo.delete(key);
      else proximo.add(key);
      return proximo;
    });

  return (
    <div className="flex flex-col overflow-hidden rounded-[8px] border border-line-2 bg-bg-0">
      <div
        className={cn(
          'grid h-9 items-center gap-x-4 border-b border-line-2 bg-bg-1 pl-4 pr-2 max-md:hidden',
          grid,
        )}
      >
        <span className="flex items-center gap-2">
          <span className={TH}>Chave</span>
          <Tag tone="count">{rows.length}</Tag>
        </span>
        <span className={TH}>Valor</span>
        {variant === 'full' && <span className={TH}>Origem</span>}
        <span className={cn(TH, 'text-right')}>Ações</span>
      </div>

      {rows.length === 0 && (
        <p className="m-0 px-4 py-6 text-center text-xs leading-4 text-text-3">
          Nenhuma variável definida.
        </p>
      )}

      {rows.map((row) => {
        const aberta = revealed.has(row.key);
        return (
          <div
            key={row.key}
            className={cn(
              'grid h-11 items-center gap-x-4 border-b border-line-1 pl-4 pr-2 last:border-0',
              'max-md:h-14 max-md:grid-rows-2 max-md:items-start max-md:py-2',
              grid,
            )}
          >
            <span className="whitespace-nowrap font-mono tabular-nums text-xs leading-[18px] text-text-1 max-md:col-span-1 max-md:text-[13px]">
              {row.key}
            </span>
            <span className="flex min-w-0 items-center gap-2 max-md:col-start-1 max-md:row-start-2">
              <span
                className={cn(
                  'min-w-0 truncate font-mono tabular-nums text-xs leading-[18px] text-text-2',
                  !aberta && 'tracking-[0.08em]',
                )}
              >
                {aberta ? row.value : '••••••••'}
              </span>
              {!aberta && <Lock className="h-[11px] w-[11px] shrink-0 text-text-3" aria-hidden />}
            </span>
            {variant === 'full' && (
              <span className="text-xs leading-[18px] text-text-2 max-md:hidden">{row.origin ?? 'App'}</span>
            )}
            <span className="flex items-center justify-end gap-1 max-md:row-span-2 max-md:row-start-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => toggle(row.key)}
                aria-label={`${aberta ? 'Ocultar' : 'Revelar'} ${row.key}`}
              >
                {aberta ? <EyeOff /> : <Eye />}
              </Button>
              {variant === 'full' && onCopy && (
                <Button variant="ghost" size="icon-xs" onClick={() => onCopy(row)} aria-label={`Copiar ${row.key}`}>
                  <Copy />
                </Button>
              )}
              {onRemove && !row.inherited && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onRemove(row.key)}
                  aria-label={`Remover ${row.key}`}
                >
                  <Trash2 />
                </Button>
              )}
            </span>
          </div>
        );
      })}

      <div className="flex items-center gap-2 border-t border-line-1 p-2 pl-3">
        {onAdd && (
          <Button variant="ghost" size="xs" onClick={onAdd}>
            <Plus />
            Adicionar variável
          </Button>
        )}
        <span className="min-w-0 flex-1" />
        {onPaste && (
          <Button variant="secondary" size="xs" onClick={onPaste}>
            <FileInput />
            Colar .env
          </Button>
        )}
      </div>

      {note && <p className="m-0 border-t border-line-1 px-3 py-2 text-xs leading-4 text-text-3">{note}</p>}
    </div>
  );
}
