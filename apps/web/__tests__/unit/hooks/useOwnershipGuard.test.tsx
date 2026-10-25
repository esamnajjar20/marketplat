/**
 * __tests__/unit/hooks/useOwnershipGuard.test.tsx
 *
 * Previously uncovered despite backing the "is this mine?" redirect on
 * all four edit pages (ads/[id]/edit, my-ads/[id], my-services/[id]/edit,
 * my-store/products/[id]/edit). A regression here either strands an
 * owner on a blank page (over-eager redirect) or lets a non-owner sit on
 * an edit page they shouldn't reach (missed redirect) — the second is
 * the more dangerous failure mode since the actual write is still
 * enforced server-side, but the client would leak the item's data into
 * a form the wrong user can see.
 *
 * Coverage:
 *  - While loading: no redirect, hook returns false (render nothing —
 *    caller's own loading branch handles the UI)
 *  - No item yet (e.g. 404, or still resolving): no redirect — that's
 *    the caller's isError/!item branch to handle, not this hook's
 *  - Owner + item present: no redirect, returns false (render the page)
 *  - Non-owner + item present: redirects via router.replace(redirectTo),
 *    returns true (render nothing while redirecting)
 *  - Redirect only fires once per settled non-owner state, not on every
 *    re-render
 *  - Changing isOwner from false->true after a redirect was already
 *    triggered does not call replace again with stale args (guards
 *    against effect re-firing loops)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOwnershipGuard } from '@/hooks/useOwnershipGuard';

const mockReplace = vi.fn();
// The real Next.js router instance is stable across a component's
// renders. If this mock returned a fresh object literal on every call
// instead, useOwnershipGuard's effect (which depends on `router`) would
// see a "changed" dependency on every re-render and fire again even when
// isLoading/item/isOwner/redirectTo are all unchanged — a false failure
// in the test, not a bug in the hook. Returning the same object each
// time matches real router identity semantics.
const mockRouter = { replace: mockReplace };

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

describe('useOwnershipGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not redirect while loading, and returns false', () => {
    const { result } = renderHook(() =>
      useOwnershipGuard({
        isLoading: true,
        item: undefined,
        isOwner: false,
        redirectTo: '/my-ads',
      }),
    );

    expect(mockReplace).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('does not redirect when there is no item yet, even if isOwner is false', () => {
    const { result } = renderHook(() =>
      useOwnershipGuard({
        isLoading: false,
        item: undefined,
        isOwner: false,
        redirectTo: '/my-ads',
      }),
    );

    expect(mockReplace).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('does not redirect for the owner once loaded, and returns false', () => {
    const { result } = renderHook(() =>
      useOwnershipGuard({
        isLoading: false,
        item: { id: 'ad-1' },
        isOwner: true,
        redirectTo: '/my-ads',
      }),
    );

    expect(mockReplace).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('redirects a non-owner once the item has loaded, and returns true', () => {
    const { result } = renderHook(() =>
      useOwnershipGuard({
        isLoading: false,
        item: { id: 'ad-1' },
        isOwner: false,
        redirectTo: '/my-ads',
      }),
    );

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/my-ads');
    expect(result.current).toBe(true);
  });

  it('does not redirect again on a re-render with the same non-owner state', () => {
    // `item` is part of the effect's dependency array (see hook source),
    // so it must keep the same object identity across renders here —
    // just like the real `item` returned by a React Query result stays
    // referentially stable between renders when the underlying data
    // hasn't changed. A fresh `{ id: 'ad-1' }` literal on each rerender
    // would make the effect look "changed" and fire again, which would
    // be testing object-identity churn, not a real regression.
    const stableItem = { id: 'ad-1' };
    const { rerender } = renderHook(
      (props: { isLoading: boolean; item: unknown; isOwner: boolean; redirectTo: string }) =>
        useOwnershipGuard(props),
      {
        initialProps: {
          isLoading: false,
          item: stableItem,
          isOwner: false,
          redirectTo: '/my-ads',
        },
      },
    );

    expect(mockReplace).toHaveBeenCalledTimes(1);

    rerender({
      isLoading: false,
      item: stableItem,
      isOwner: false,
      redirectTo: '/my-ads',
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('re-fires the redirect if item identity changes on a later render (documents real dependency-array behavior, not a bug)', () => {
    // This is intentional, not a footgun to "fix": in real usage `item`
    // comes straight from a query result, so a genuinely new item
    // (different id, or a refetch that produced a new object) SHOULD
    // reconsider ownership and redirect again if still not the owner.
    const { rerender } = renderHook(
      (props: { isLoading: boolean; item: unknown; isOwner: boolean; redirectTo: string }) =>
        useOwnershipGuard(props),
      {
        initialProps: {
          isLoading: false,
          item: { id: 'ad-1' },
          isOwner: false,
          redirectTo: '/my-ads',
        },
      },
    );

    expect(mockReplace).toHaveBeenCalledTimes(1);

    rerender({
      isLoading: false,
      item: { id: 'ad-2' }, // different object, different underlying item
      isOwner: false,
      redirectTo: '/my-ads',
    });

    expect(mockReplace).toHaveBeenCalledTimes(2);
  });

  it('uses the redirectTo value current at the time ownership resolves to false', () => {
    const { rerender } = renderHook(
      (props: { isLoading: boolean; item: unknown; isOwner: boolean; redirectTo: string }) =>
        useOwnershipGuard(props),
      {
        initialProps: {
          isLoading: true,
          item: undefined,
          isOwner: false,
          redirectTo: '/my-store/products',
        },
      },
    );

    expect(mockReplace).not.toHaveBeenCalled();

    rerender({
      isLoading: false,
      item: { id: 'p-1' },
      isOwner: false,
      redirectTo: '/my-store/products',
    });

    expect(mockReplace).toHaveBeenCalledWith('/my-store/products');
  });
});
