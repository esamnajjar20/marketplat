import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * HOME-FLICKER-01: shown by next/dynamic while a lazy home section's JS chunk
 * loads. Same shape and height as LazySection's own placeholder, so there is no
 * blank frame between "skeleton" and "section skeleton" while scrolling.
 */
export function HomeSectionFallback({ minHeight = 240 }: { minHeight?: number }) {
  return (
    <div
      className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3"
      style={{ minHeight }}
      aria-hidden
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-40 shrink-0 rounded-xl sm:w-auto" />
        ))}
      </div>
    </div>
  );
}
