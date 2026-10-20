'use client';

/** Tiny count badge next to a filter option label. */
export function FacetCountBadge({ count }: { count?: number }) {
  if (count == null || count < 0) return null;
  return (
    <span className="ms-1 text-2xs tabular-nums text-muted-foreground">
      ({count})
    </span>
  );
}
