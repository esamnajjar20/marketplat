'use client';

/**
 * useOwnedListPage / useOutOfRangeRedirect — shared "my X list"
 * page/status/recovery logic.
 *
 * REFACTOR (duplication audit, "My X Lists" pattern): MyAdsList,
 * MyServiceListingsList, and MyProductsList each hand-rolled the exact
 * same sequence: read `page`/`status` off the URL search params ->
 * compute `isOutOfRange` once the query resolves -> a `useEffect` that
 * replaces the URL back to the last valid page (or strips `page`
 * entirely at page 1) once the current page no longer exists -> a
 * `setStatus` helper that updates the status filter and resets `page`.
 * MyProductsList's own comment even said it "mirrors
 * MyServiceListingsList's shape one-for-one, including its
 * out-of-range-page recovery fix" — these two hooks are that shared
 * shape, extracted once instead of copied a third time.
 *
 * Deliberately NOT covered here (stays in each component, because it
 * genuinely differs):
 *   - data fetching itself (useMyAds / useMyServiceListings /
 *     useMyProducts each have different query keys, params, and
 *     status enums)
 *   - the status filter *labels* and which statuses exist
 *     (ads: ACTIVE/SOLD/DELETED, services & products: ACTIVE/PAUSED/DELETED)
 *   - the isLoading/isError/empty JSX branches and the item list itself
 *   - the delete ConfirmDialog and any per-item mutations (mark as
 *     sold, toggle paused) — those are domain actions, not paging state
 *
 * This intentionally does NOT try to also cover FavoritesList,
 * SavedSearchesList, or FollowedStoresList — none of the three have
 * this out-of-range-recovery + status-filter shape at all (no
 * ConfirmDialog, no status filter, and SavedSearchesList has no
 * pagination whatsoever), so folding them in here would force an
 * abstraction over components that don't actually share this
 * behavior.
 *
 * Split into two hooks (rather than one) because of a real ordering
 * constraint: `page`/`status` are needed to build each component's own
 * useQuery call, but the out-of-range check can only run *after* that
 * query has resolved and returned totalPages. useOwnedListPage supplies
 * the former; useOutOfRangeRedirect consumes the query's result and
 * supplies the latter. Both are called unconditionally from the top of
 * each component, same as any other hook — no hook is ever called
 * conditionally or nested inside another function.
 */
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface UseOwnedListPageResult<S extends string> {
  page: number;
  /** Current status filter value, or undefined for "all". */
  status: S | undefined;
  /** Updates the status filter in the URL and resets to page 1. */
  setStatus: (status: string) => void;
  /** The same searchParams instance this hook read from — reuse this
   * for e.g. Pagination's searchParams prop instead of calling
   * useSearchParams() again. */
  searchParams: URLSearchParams;
}

/** Reads page/status from the URL and returns a setter for the status filter. */
export function useOwnedListPage<S extends string>(baseUrl: string): UseOwnedListPageResult<S> {
  const sp     = useSearchParams();
  const router = useRouter();

  const page   = Number(sp.get('page') ?? 1);
  const status = (sp.get('status') ?? undefined) as S | undefined;

  function setStatus(s: string) {
    const params = new URLSearchParams(sp.toString());
    if (s) params.set('status', s); else params.delete('status');
    params.delete('page');
    router.push(`${baseUrl}?${params.toString()}`);
  }

  return { page, status, setStatus, searchParams: sp };
}

interface UseOutOfRangeRedirectOptions {
  baseUrl: string;
  page: number;
  /** totalPages from the resolved query's pagination meta (defaults to 1 while loading). */
  totalPages: number | undefined;
  /** Whether the query has resolved at least once (data !== undefined). */
  hasData: boolean;
  /** Reuse the searchParams instance from useOwnedListPage instead of a fresh useSearchParams() call. */
  searchParams: URLSearchParams;
}

/**
 * Recovery-from-out-of-range-page fix: e.g. deleting the only item on a
 * non-first page previously left the user stranded with no way back
 * (Pagination hides itself once totalPages <= 1, and a generic empty
 * state can't distinguish "you have zero items" from "you're on a page
 * that no longer exists"). Redirects to the last valid page
 * automatically once data confirms the current page is out of range.
 *
 * Returns true while the page is out of range and a redirect is in
 * flight — callers should keep showing a loading state in that case
 * (same as the original `isLoading || isOutOfRange` check in each list).
 */
export function useOutOfRangeRedirect({
  baseUrl,
  page,
  totalPages,
  hasData,
  searchParams: sp,
}: UseOutOfRangeRedirectOptions): boolean {
  const router = useRouter();

  const resolvedTotalPages = totalPages ?? 1;
  const isOutOfRange = hasData && page > resolvedTotalPages && resolvedTotalPages >= 1;

  useEffect(() => {
    if (!hasData) return; // wait for the query to resolve first
    if (page > resolvedTotalPages && resolvedTotalPages >= 1) {
      const params = new URLSearchParams(sp.toString());
      if (resolvedTotalPages > 1) params.set('page', String(resolvedTotalPages));
      else params.delete('page');
      router.replace(`${baseUrl}?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, page, resolvedTotalPages, sp, router, baseUrl]);

  return isOutOfRange;
}
