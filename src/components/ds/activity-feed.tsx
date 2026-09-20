import * as React from 'react';
import { cn } from '@/lib/utils';
import { PANEL_TZ_LABEL, formatAbsolute, formatRelative } from '@/lib/format';
import { LevelTag, type Level } from './level-tag';

/**
 * Feed de atividade agrupado por dia.
 *
 * Três regras que o feed antigo quebrava:
 *
 * - **Eventos idênticos consecutivos colapsam** com contagem (`×3`). Sem isso, um app
 *   em crash loop enche a lista e esconde tudo o mais que aconteceu.
 * - **O relativo é o texto visível; o absoluto vai no `dateTime` e no `title`.** Quem
 *   precisa do horário exato passa o mouse; quem quer saber "foi agora?" lê direto.
 * - **O fuso é declarado uma vez**, no rodapé — não por linha.
 */
export interface ActivityItem {
  id: string;
  level: Level;
  message: string;
  source?: string;
  at: string;
}

/** Colapsa eventos idênticos consecutivos. Puro, para ser testável. */
export function collapseRepeats(items: ActivityItem[]): (ActivityItem & { count: number })[] {
  const out: (ActivityItem & { count: number })[] = [];
  for (const item of items) {
    const anterior = out[out.length - 1];
    if (anterior && anterior.message === item.message && anterior.level === item.level && anterior.source === item.source) {
      anterior.count++;
      continue;
    }
    out.push({ ...item, count: 1 });
  }
  return out;
}

/** Agrupa por dia no fuso do painel, usando o rótulo já traduzido de `formatAbsolute`. */
export function groupByDay(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const grupos: { label: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    // `formatAbsolute` devolve "hoje 04:05" / "15 set 03:20": o dia é tudo menos a hora.
    const absoluto = formatAbsolute(item.at);
    const label = absoluto.replace(/\s\d{2}:\d{2}$/, '');
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.label === label) ultimo.items.push(item);
    else grupos.push({ label, items: [item] });
  }
  return grupos;
}

export function ActivityFeed({ items, className }: { items: ActivityItem[]; className?: string }) {
  const grupos = groupByDay(items);

  return (
    <div className={cn('flex flex-col', className)}>
      {grupos.map((grupo) => (
        <section key={grupo.label} className="flex flex-col">
          <div className="flex items-center gap-3 px-1 pb-1 pt-3 first:pt-0">
            <span className="text-2xs font-medium uppercase leading-4 tracking-[0.06em] text-text-3">
              {grupo.label}
            </span>
            <span aria-hidden className="h-px flex-1 bg-line-1" />
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            {collapseRepeats(grupo.items).map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-line-1 py-2 last:border-0"
              >
                <span className="flex h-5 items-center">
                  <LevelTag level={item.level} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span title={item.message} className="truncate text-[13px] leading-5 text-text-1 max-md:text-[15px]">
                    {item.message}
                    {item.count > 1 && (
                      <span className="ml-1.5 font-mono tabular-nums text-2xs text-text-3">×{item.count}</span>
                    )}
                  </span>
                  {item.source && (
                    <span className="truncate font-mono tabular-nums text-2xs leading-4 text-text-3">
                      {item.source}
                    </span>
                  )}
                </span>
                <time
                  dateTime={item.at}
                  title={formatAbsolute(item.at)}
                  className="whitespace-nowrap font-mono tabular-nums text-2xs leading-5 text-text-3"
                >
                  {formatRelative(item.at, { units: 1 })}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="m-0 pt-3 font-mono tabular-nums text-2xs leading-4 text-text-3">{PANEL_TZ_LABEL}</p>
    </div>
  );
}
