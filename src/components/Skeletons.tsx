import { Skeleton } from '@/components/ui/skeleton';

/**
 * Esqueletos de carregamento.
 *
 * As telas mostravam um spinner centralizado ocupando a área inteira: durante o
 * carregamento não dava para saber o que estava vindo, e a página "pulava" quando o
 * conteúdo chegava. O esqueleto mantém o formato do que vai aparecer, então a transição
 * é estável e a tela comunica o que está carregando.
 *
 * O componente `Skeleton` já existia em `components/ui` e não era usado em lugar nenhum.
 */

export function AppCardSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-48" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-8" />
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-6 rounded" />
      </div>
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/** Linhas de log/console. */
export function LogLinesSkeleton({ lines = 12 }: { lines?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-3 w-16 shrink-0" />
          <Skeleton className="h-3 w-12 shrink-0" />
          <Skeleton className="h-3" style={{ width: `${35 + ((index * 17) % 55)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Itens da linha do tempo de releases. */
export function VersionListSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="flex gap-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailHeaderSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-3 w-80" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
