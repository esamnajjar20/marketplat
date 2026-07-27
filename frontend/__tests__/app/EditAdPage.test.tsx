/**
 * __tests__/app/EditAdPage.test.tsx
 *
 * FIX UX-14: this page had no ownership check at all — a user could
 * open the edit URL for any ad by id and see the full edit form,
 * only discovering they lacked permission when the backend rejected
 * the save (ads.service.ts's updateAd already enforces this
 * correctly — this is a UX gap, not a security one). Covers the
 * redirect-away behavior for a non-owner, and that an owner/admin
 * still reaches the form normally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { Suspense } from 'react';
import EditAdPage from '@/app/(protected)/ads/[id]/edit/page';
import { useAd } from '@/hooks/queries/useAds';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import type { Ad } from '@/types/ad.types';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));

vi.mock('@/hooks/queries/useAds', () => ({
  useAd: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAdmin: (s: { isAdmin: boolean }) => s.isAdmin,
}));

vi.mock('@/components/ads/EditAdForm', () => ({
  EditAdForm: ({ ad }: { ad: Ad }) => <div>EditAdForm: {ad.id}</div>,
}));

const otherUsersAd = { id: 'ad-1', title: 'إعلان', userId: 'owner-1' } as Ad;

function mockAuth(user: { id: string } | null, isAdmin = false) {
  vi.mocked(useAuthStore).mockImplementation(
    (selector: (s: { user: unknown; isAdmin: boolean }) => unknown) => selector({ user, isAdmin }),
  );
}

async function renderPage(id = 'ad-1') {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={<div>loading params…</div>}>
        <EditAdPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
    // Let the params Promise (and the microtask React's use() schedules
    // off it) actually settle before we start polling. render() alone
    // only flushes React's own synchronous work; the Promise resolving
    // happens on a separate microtask that needs its own tick here or
    // the Suspense fallback never gets a chance to commit past itself
    // in jsdom.
    await Promise.resolve();
  });
  // React's use() throws the params Promise to trigger Suspense, then
  // needs an actual render pass (not just the Promise settling) to
  // commit past the fallback once it resolves. Rather than guessing
  // how many ticks that takes, poll until the fallback is gone.
  await waitFor(() => {
    expect(screen.queryByText('loading params…')).not.toBeInTheDocument();
  });
  return result;
}

describe('EditAdPage — ownership check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a non-owner away to /my-ads instead of showing the form', async () => {
    vi.mocked(useAd).mockReturnValue({ data: otherUsersAd, isLoading: false, isError: false } as never);
    mockAuth({ id: 'someone-else' }, false);

    await renderPage();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(ROUTES.myAds));
    expect(screen.queryByText(/EditAdForm/)).not.toBeInTheDocument();
  });

  it('renders the form for the ad owner', async () => {
    vi.mocked(useAd).mockReturnValue({ data: otherUsersAd, isLoading: false, isError: false } as never);
    mockAuth({ id: 'owner-1' }, false);

    await renderPage();

    await waitFor(() => expect(screen.getByText('EditAdForm: ad-1')).toBeInTheDocument());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders the form for an admin even when they are not the owner', async () => {
    vi.mocked(useAd).mockReturnValue({ data: otherUsersAd, isLoading: false, isError: false } as never);
    mockAuth({ id: 'admin-1' }, true);

    await renderPage();

    await waitFor(() => expect(screen.getByText('EditAdForm: ad-1')).toBeInTheDocument());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect while still loading', async () => {
    vi.mocked(useAd).mockReturnValue({ data: undefined, isLoading: true, isError: false } as never);
    mockAuth({ id: 'someone-else' }, false);

    await renderPage();

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
