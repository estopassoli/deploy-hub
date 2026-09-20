import * as React from 'react';
import { cn } from '@/lib/utils';
import { PANEL_TZ_LABEL } from '@/lib/format';
import { LevelTag, type Level } from './level-tag';
import { Kbd } from './kbd';

/**
 * Visor de log: toolbar, régua de dia, linhas em grade fixa, rodapé.
 *
 * ## A grade
 *
 * Quatro colunas iguais para todas as linhas — `92px 52px 64px 1fr`. Sem grade fixa, o
 * timestamp de uma linha não alinha com o da seguinte e o olho perde a coluna, que é a
 * única forma de varrer um log longo rápido.
 *
 * ## Duas regras que o painel violava
 *
 * - **O fuso é declarado uma vez**, no rodapé. Antes uma coluna usava o fuso do
 *   navegador e a mensagem ao lado trazia UTC: dava para ver 01:13 e 04:13 na mesma
 *   linha.
 * - **Nenhuma linha de log carrega emoji.** Nível é `LevelTag`, não `❌`.
 *
 * Substitui o `<pre>` do DeployLogSheet, o DeployLogPanel e a tela de Logs.
 */
export const LOG_GRID = 'grid-cols-[92px_52px_64px_minmax(0,1fr)] max-md:grid-cols-[72px_44px_minmax(0,1fr)]';

export function LogViewer({
  label,
  toolbar,
  footer,
  children,
  className,
}: {
  label: string;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn('flex flex-col overflow-hidden rounded-[8px] border border-line-2 bg-bg-0', className)}
    >
      {toolbar && (
        <div className="flex h-10 items-center gap-3 border-b border-line-1 bg-bg-1 pl-3 pr-2 max-xl:h-12">
          {toolbar}
        </div>
      )}

      <div
        className="terminal-scroll flex flex-col overflow-auto py-1 pb-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {children}
      </div>

      {footer !== null && (
        <div className="flex h-8 items-center gap-4 border-t border-line-1 bg-bg-1 px-3">{footer}</div>
      )}
    </section>
  );
}

/** Régua de dia. Obrigatória sempre que a data muda dentro do stream. */
export function DayRule({ iso, label }: { iso: string; label: string }) {
  return (
    <div role="separator" aria-label={label} className="flex items-center gap-3 px-3 pb-0.5 pt-1.5">
      <time
        dateTime={iso}
        className="text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3"
      >
        {label}
      </time>
      <span aria-hidden className="h-px flex-1 bg-line-1" />
    </div>
  );
}

export function LogLine({
  time,
  level,
  source,
  message,
  expanded,
  children,
}: {
  time: string;
  level: Level;
  source?: string;
  message: string;
  /** Linha de erro aberta: mesmo grid, fundo bg-2 e detalhe abaixo. */
  expanded?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(expanded && 'border-y border-line-1 bg-bg-2')}>
      <div className={cn('grid min-h-5 items-start gap-x-3 px-3', LOG_GRID)}>
        <span className="whitespace-nowrap font-mono tabular-nums text-[12.5px] leading-5 text-text-3 max-md:text-[13px]">
          {time}
        </span>
        <span className="flex h-5 items-center">
          <LevelTag level={level} />
        </span>
        {source !== undefined && (
          <span className="truncate font-mono tabular-nums text-[12.5px] leading-5 text-text-2 max-md:hidden">
            {source}
          </span>
        )}
        <span
          title={message}
          className="truncate font-mono tabular-nums text-[12.5px] leading-5 text-text-1 max-md:text-[13px] max-md:whitespace-pre-wrap max-md:break-words"
        >
          {message}
        </span>
      </div>
      {children && <div className="px-3 pb-2 pt-1">{children}</div>}
    </div>
  );
}

/** Rodapé padrão: contagem, fuso declarado uma vez, legenda de teclado. */
export function LogFooter({ summary, keys = true }: { summary: string; keys?: boolean }) {
  return (
    <>
      <span className="truncate font-mono tabular-nums text-2xs leading-4 text-text-3">
        {summary} · {PANEL_TZ_LABEL}
      </span>
      <span className="flex-1" />
      {keys && (
        <span className="flex items-center gap-4 max-xl:hidden">
          <span className="flex items-center gap-1.5">
            <Kbd>/</Kbd>
            <span className="text-xs text-text-3">filtrar</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>F</Kbd>
            <span className="text-xs text-text-3">seguir</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>W</Kbd>
            <span className="text-xs text-text-3">quebrar</span>
          </span>
        </span>
      )}
    </>
  );
}
