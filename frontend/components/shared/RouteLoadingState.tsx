/** Shared non-empty loading UI for route transitions and slow connections. */
export function RouteLoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[45vh] min-h-[45dvh] flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">جارٍ تحميل الصفحة…</p>
    </div>
  );
}
