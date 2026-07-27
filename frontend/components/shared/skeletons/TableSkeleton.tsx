/**
 * TableSkeleton — used in admin data tables while server data loads.
 * Column count and row count are configurable.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn }       from '@/lib/utils';

interface TableSkeletonProps {
  rows?:    number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows    = 8,
  columns = 5,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn('w-full overflow-hidden rounded-lg border', className)}>
      {/* Header row */}
      <div
        className="grid gap-4 border-b bg-muted/50 px-4 py-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-3/4" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid gap-4 border-b px-4 py-3 last:border-0"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className={cn('h-4', colIdx === 0 ? 'w-1/2' : 'w-full')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Single row skeleton for inline loading states. */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div
      className="grid gap-4 border-b px-4 py-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
