export function RequestListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="animate-pulse rounded-xl border border-border/60 bg-card p-4"
        >
          <div className="flex gap-2">
            <div className="h-5 w-14 rounded-full bg-muted" />
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="ms-auto h-4 w-16 rounded bg-muted" />
          </div>
          <div className="mt-3 h-5 w-[85%] rounded bg-muted" />
          <div className="mt-2 h-4 w-full rounded bg-muted" />
          <div className="mt-1 h-4 w-2/3 rounded bg-muted" />
          <div className="mt-3 flex gap-3">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-16 rounded bg-muted" />
          </div>
          <div className="mt-3 flex justify-between border-t border-border/40 pt-2.5">
            <div className="h-3.5 w-20 rounded bg-muted" />
            <div className="h-3.5 w-16 rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}
