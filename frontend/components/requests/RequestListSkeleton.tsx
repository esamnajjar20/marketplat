export function RequestListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="space-y-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="animate-pulse rounded-xl border p-4">
          <div className="flex gap-2">
            <div className="h-5 w-14 rounded-full bg-muted" />
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="ms-auto h-4 w-20 rounded bg-muted" />
          </div>
          <div className="mt-3 h-5 w-3/4 rounded bg-muted" />
          <div className="mt-2 h-4 w-full rounded bg-muted" />
          <div className="mt-1 h-4 w-2/3 rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}
