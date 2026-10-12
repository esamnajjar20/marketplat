'use client';

import { useEffect } from 'react';

/**
 * Keeps a page-number state inside the range the server just reported.
 * When items disappear (unfollow, deletion elsewhere) while the user is on
 * the last page, the refetched page can be empty with `totalPages` smaller
 * than `page`; without clamping the list renders blank and the pagination
 * control (hidden for a single page) offers no way back.
 */
export function useClampedPage(
  page: number,
  totalPages: number | undefined,
  setPage: (page: number) => void,
): void {
  useEffect(() => {
    if (totalPages === undefined) return;
    const lastPage = Math.max(1, totalPages);
    if (page > lastPage) setPage(lastPage);
  }, [page, totalPages, setPage]);
}
