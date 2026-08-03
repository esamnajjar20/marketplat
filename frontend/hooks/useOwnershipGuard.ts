'use client';

/**
 * useOwnershipGuard — shared "is this mine, and if not, redirect" logic.
 *
 * AUDIT-FIX (protected #7): four edit pages (ads/[id]/edit, my-ads/[id],
 * my-services/[id]/edit, my-store/products/[id]/edit) each hand-rolled
 * the exact same sequence: fetch item -> fetch a second query needed to
 * determine ownership -> compute isOwner -> useEffect that redirects
 * silently on rejection -> the same isLoading/isError/!isOwner render
 * branching. The only real difference between them was *how* ownership
 * is computed: ads compare a direct `userId` field, while services and
 * products have no direct owner field (deeper relation chain) and
 * instead check membership in the caller's own "my X" list, which the
 * backend already scopes to the authenticated user.
 *
 * This hook covers both shapes via `isOwner`, a caller-supplied
 * predicate, so each page keeps its own data-fetching (item + whatever
 * second query it needs) but delegates the loading/redirect/render-gate
 * sequencing here. Kept deliberately small: it does not fetch anything
 * itself, since the two ownership strategies pull from different hooks
 * entirely (useAd vs useMyServiceListings/useMyProducts) and forcing a
 * single fetch signature would obscure that difference rather than
 * remove real duplication.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface UseOwnershipGuardOptions {
  /** True once every query this check depends on has settled. */
  isLoading: boolean;
  /** The fetched item itself, or undefined/null if not found. */
  item: unknown;
  /** Caller-computed ownership check (direct field compare, or list membership). */
  isOwner: boolean;
  /** Where to send a non-owner. */
  redirectTo: string;
}

/**
 * Returns true while the page should render nothing (still loading, or
 * redirecting a non-owner away). Callers keep their own isError/!item
 * -> notFound() branch, since that's identical across all four pages
 * and doesn't need abstracting.
 */
export function useOwnershipGuard({
  isLoading,
  item,
  isOwner,
  redirectTo,
}: UseOwnershipGuardOptions): boolean {
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && item && !isOwner) {
      router.replace(redirectTo);
    }
  }, [isLoading, item, isOwner, redirectTo, router]);

  return !isOwner && !isLoading && !!item;
}
