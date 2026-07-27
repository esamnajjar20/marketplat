/**
 * PERF-09: Root loading UI for all public pages.
 * Shown while the page Server Component is streaming.
 * Kept intentionally minimal — just a top progress bar shimmer.
 */
export default function PublicLoading() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-muted">
      <div className="h-full w-1/3 animate-[shimmer_1.5s_infinite] bg-primary/60" />
    </div>
  );
}
