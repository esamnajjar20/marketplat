import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function SavedSearchesLoading() {
  return (
    // AUDIT-FIX (protected #8): matches saved-searches/page.tsx's
    // "space-y-4" wrapper instead of duplicating ProtectedLayout's own
    // p-6 padding via an extra container.
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
