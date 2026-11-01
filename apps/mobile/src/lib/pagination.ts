/** Normalize server pagination metadata without guessing that every missing field means page 1 only. */
export type PageMetaLike = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  nextCursor?: string | null;
};

/** Merge an incoming page while preserving order and removing duplicate entity keys. */
export function mergeUniquePageItems<T>(
  current: readonly T[],
  incoming: readonly T[],
  getKey: (item: T) => string,
): T[] {
  const seen = new Set(current.map(getKey));
  const merged = [...current];
  for (const item of incoming) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export function resolvePageState(
  meta: PageMetaLike | undefined,
  requestedPage: number,
  itemCount: number,
  pageSize: number,
): { page: number; totalPages: number; hasNextPage: boolean } {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 1;
  const page = Number.isInteger(meta?.page) && (meta?.page ?? 0) > 0 ? meta!.page! : Math.max(1, requestedPage);
  let totalPages: number;
  if (Number.isInteger(meta?.totalPages) && (meta?.totalPages ?? -1) >= 0) {
    totalPages = meta!.totalPages!;
  } else if (Number.isFinite(meta?.total) && (meta?.total ?? -1) >= 0) {
    totalPages = Math.ceil(meta!.total! / safePageSize);
  } else {
    // Without server metadata, a short page is the only safe terminal-page signal.
    totalPages = itemCount < safePageSize ? page : page + 1;
  }
  const hasNextPage = typeof meta?.hasNextPage === 'boolean'
    ? meta.hasNextPage
    : page < totalPages;
  return { page, totalPages: Math.max(page, totalPages), hasNextPage };
}
