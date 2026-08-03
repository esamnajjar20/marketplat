/**
 * Pagination — URL-based pagination component.
 * Reads current page from searchParams and renders page controls.
 *
 * UX-01 FIX: When Button uses asChild + Link, the disabled prop on Button
 *   only adds visual opacity — it does NOT prevent the Link from being
 *   focusable or navigated by keyboard/screen reader. Fix: render a <span>
 *   with aria-disabled when on the first/last page instead of a <Link>.
 */
'use client';

import Link from 'next/link';
import { Button } from './Button';

interface PaginationProps {
  totalPages:   number;
  currentPage:  number;
  baseUrl:      string;
  searchParams?: Record<string, string | undefined>;
  /**
   * FIX BUG-09: defaults to 'page', unchanged for every existing caller.
   * StoreProducts and StoreReviewsList render side-by-side on the same
   * store page and previously both read/wrote the same bare `page`
   * param through this component — paginating one section silently
   * reset or jumped the other, since they shared one counter with no
   * way to tell which section a `page=N` in the URL belonged to. This
   * lets each section use its own param name (`productsPage` /
   * `reviewsPage`) while keeping every other page's plain `?page=`
   * links untouched.
   */
  pageParam?: string;
}

export function Pagination({
  totalPages,
  currentPage,
  baseUrl,
  searchParams = {},
  pageParam = 'page',
}: PaginationProps) {
  function buildPageUrl(page: number): string {
    const params = new URLSearchParams(
      Object.entries({ ...searchParams, [pageParam]: String(page) })
        .filter(([, v]) => v !== undefined) as [string, string][],
    );
    return `${baseUrl}?${params.toString()}`;
  }

  if (totalPages <= 1) return null;

  const isFirst = currentPage <= 1;
  const isLast  = currentPage >= totalPages;

  return (
    <nav
      className="flex items-center justify-center gap-2 py-8"
      aria-label="Pagination"
    >
      {/* UX-01 FIX: disabled pages render as <span> so they are not focusable */}
      {isFirst ? (
        <Button
          variant="outline"
          size="sm"
          disabled
          aria-disabled="true"
          className="pointer-events-none opacity-50"
        >
          السابق
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={buildPageUrl(currentPage - 1)} aria-label="الصفحة السابقة">
            السابق
          </Link>
        </Button>
      )}

      <span
        className="text-sm text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        {currentPage} / {totalPages}
      </span>

      {isLast ? (
        <Button
          variant="outline"
          size="sm"
          disabled
          aria-disabled="true"
          className="pointer-events-none opacity-50"
        >
          التالي
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={buildPageUrl(currentPage + 1)} aria-label="الصفحة التالية">
            التالي
          </Link>
        </Button>
      )}
    </nav>
  );
}
