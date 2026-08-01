import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function SavedSearchesLoading() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
