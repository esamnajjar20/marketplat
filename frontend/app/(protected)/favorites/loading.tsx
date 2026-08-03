/**
 * PERF-09: Favorites page loading skeleton.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function FavoritesLoading() {
  return (
    // AUDIT-FIX (protected #8): matches favorites/page.tsx's
    // "space-y-4" wrapper instead of duplicating ProtectedLayout's
    // own p-6 padding via an extra container.
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
