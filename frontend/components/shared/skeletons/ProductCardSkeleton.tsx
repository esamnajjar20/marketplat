import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * Home §12 / ProductsGrid loading state. ProductCard uses a square
 * (aspect-square) image, not AdCardSkeleton's 4:3 — needs its own
 * shape rather than reusing that one.
 */
export function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Skeleton className="aspect-square w-full" />
      <div className="space-y-1 p-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  );
}
