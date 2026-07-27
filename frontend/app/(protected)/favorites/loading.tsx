/**
 * PERF-09: Favorites page loading skeleton.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function FavoritesLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <Skeleton className="mb-6 h-8 w-40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
