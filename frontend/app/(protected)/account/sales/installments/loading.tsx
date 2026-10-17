import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main dir="rtl" aria-label="جارٍ تحميل الأقساط" className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    </main>
  );
}
