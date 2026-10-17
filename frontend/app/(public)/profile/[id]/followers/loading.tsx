import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main dir="rtl" aria-label="جارٍ تحميل المتابعين" className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    </main>
  );
}
