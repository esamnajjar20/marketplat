'use client';

/**
 * Pagination — URL-based pagination component.
 * Reads current page from searchParams and renders page controls.
 *
 * UX-01 FIX: When Button uses asChild + Link, the disabled prop on Button
 *   only adds visual opacity — it does NOT prevent the Link from being
 *   focusable or navigated by keyboard/screen reader. Fix: render a <span>
 *   with aria-disabled when on the first/last page instead of a <Link>.
 *
 * Prev/Next + a bare "N / total" counter gave no way to jump
 *   more than one page at a time — costly on admin tables with dozens
 *   of pages. getPageNumbers() below builds a truncated run (first,
 *   last, current ±1, with "…" gaps) same as most table UIs. The
 *   existing "N / total" counter stays (it's what Pagination.test.tsx's
 *   aria-live assertions target, and it's the only piece screen readers
 *   need announced on every page change — the numbered buttons are a
 *   supplementary visual/mouse shortcut, not a replacement).
 */

import Link from 'next/link';
import { Button } from './Button';

interface PaginationProps {
  totalPages:   number;
  currentPage:  number;
  baseUrl:      string;
  searchParams?: Record<string, string | undefined>;
  /**
   * defaults to 'page', unchanged for every existing caller.
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

/**
 * Builds a truncated page list: always shows first, last, current page
 * and its immediate neighbors; collapses any gap into a single 'gap'
 * marker (never more than one marker in a row) so a 200-page admin
 * table still renders a short, strip.
 */
function getPageNumbers(current: number, total: number): (number | 'gap')[] {
  const pages = new Set<number>([1, total, current]);
  if (current - 1 >= 1) pages.add(current - 1);
  if (current + 1 <= total) pages.add(current + 1);

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];

    if (current === undefined) continue;

    if (previous !== undefined && current - previous > 1) {
      result.push('gap');
    }

    result.push(current);
  }
  return result;
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
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-2 py-8"
      aria-label="التنقل بين الصفحات"
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

      {/* FIX P2-6: numbered page buttons, hidden on the smallest screens
          where the counter below already does the job and horizontal
          space is tight (matches the sm:table-cell truncation pattern
          already used elsewhere, e.g. AdminAuditLogsTable). */}
      <div className="hidden items-center gap-1 sm:flex">
        {pageNumbers.map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">
              …
            </span>
          ) : p === currentPage ? (
            <span
              key={p}
              aria-current="page"
              className="flex h-9 min-w-9 items-center justify-center rounded-md bg-primary px-2 text-sm font-medium text-primary-foreground"
            >
              {p}
            </span>
          ) : (
            <Button key={p} asChild variant="outline" size="sm" className="h-9 min-w-9 px-2">
              <Link href={buildPageUrl(p)} aria-label={`الصفحة ${p}`}>
                {p}
              </Link>
            </Button>
          ),
        )}
      </div>

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
