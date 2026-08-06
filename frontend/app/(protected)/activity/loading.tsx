import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function ActivityLoading() {
  return (
    // Matches page.tsx's "space-y-4" wrapper instead of duplicating
    // ProtectedLayout's own p-6 padding via an extra container — same
    // convention as saved-searches/loading.tsx.
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
