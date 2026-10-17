import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main dir="rtl" aria-label="جارٍ تحميل القصص" className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton key="item-0" className="h-28 w-full" />
        <Skeleton key="item-1" className="h-28 w-full" />
        <Skeleton key="item-2" className="h-28 w-full" />
      </div>
    </main>
  );
}
