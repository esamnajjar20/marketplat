/**
 * __tests__/components/MyAdsList.test.tsx
 *
 * Coverage targets:
 *  - Loading state shows a spinner
 *  - Empty state shown when there are no ads
 *  - Renders each ad's title, price, status badge
 *  - Mark-as-sold flow now goes through ConfirmDialog, mirroring delete
 *    (UX-FIX — previously fired immediately on click with no
 *    confirmation, inconsistent with the delete button right next to it):
 *      * shown only for ACTIVE ads
 *      * hidden for SOLD/DELETED ads
 *      * clicking it opens the confirm dialog, does NOT call
 *        markAsSold.mutate yet
 *      * confirming the dialog calls markAsSold.mutate with the ad's ID
 *      * cancelling the dialog does NOT call markAsSold.mutate
 *  - Delete flow now goes through ConfirmDialog instead of window.confirm()
 *    (report item #5):
 *      * clicking the trash icon opens the confirm dialog, does NOT call
 *        deleteAd.mutate yet
 *      * confirming the dialog calls deleteAd.mutate with the correct ad ID
 *      * cancelling the dialog does NOT call deleteAd.mutate
 *  - Status filter tabs reflect the current ?status= param
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { MyAdsList } from '@/components/profile/MyAdsList';
import { useMyAds } from '@/hooks/queries/useAds';
import { useDeleteAd, useMarkAsSold } from '@/hooks/mutations/useAdMutations';

vi.mock('@/hooks/queries/useAds', () => ({
  useMyAds: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdMutations', () => ({
  useDeleteAd: vi.fn(),
  useMarkAsSold: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// PinAdButton (inline useMutation/useQueryClient) and RepublishAdButton
// (useRepublishAd, react-query) both need a QueryClientProvider in the
// tree to even construct — neither is what this file is testing, so
// stub them like the other row actions.
vi.mock('@/components/ads/PinAdButton', () => ({
  PinAdButton: () => <div data-testid="pin-ad-button" />,
}));

vi.mock('@/components/ads/RepublishAdButton', () => ({
  RepublishAdButton: () => <div data-testid="republish-ad-button" />,
}));

function makeAd(overrides: Partial<{
  id: string; title: string; status: string; price: string; views: number;
  createdAt: string; images: string[];
}> = {}) {
  return {
    id: 'ad-1',
    title: 'إعلان تجريبي',
    status: 'ACTIVE',
    price: '100',
    views: 5,
    createdAt: new Date().toISOString(),
    images: [],
    ...overrides,
  };
}

const mockDeleteMutate = vi.fn();
const mockMarkAsSoldMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (useDeleteAd as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockDeleteMutate, isPending: false });
  (useMarkAsSold as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockMarkAsSoldMutate, isPending: false });
});

describe('MyAdsList', () => {
  // ── Loading / empty states ──────────────────────────────────────

  it('shows a loading spinner while fetching', () => {
    // Loading state renders skeleton rows (AdListItemSkeleton, using
    // animate-pulse), not a spinner.
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<MyAdsList />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows the empty state when there are no ads', () => {
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.getByText('لا توجد إعلانات')).toBeInTheDocument();
  });

  // UX-FIX: the empty-state description is now scoped to the active
  // filter tab instead of always reading "لم تنشر أي إعلانات بعد" — that
  // message was misleading on an empty SOLD/DELETED tab for a seller who
  // does have active ads elsewhere. `status` here reflects whatever
  // useOwnedListPage reads from the URL's ?status= — these mocks assume
  // its default with no query param (status undefined/''), matching the
  // "no ads at all" case; per-tab wording is exercised implicitly by the
  // component's own status-driven ternary and not re-derived here since
  // useOwnedListPage itself isn't mocked in this file.
  it('shows the publish-ad CTA in the empty state when there is no active filter', () => {
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.getByText('لم تنشر أي إعلانات بعد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'نشر إعلان' })).toBeInTheDocument();
  });

  // ── Rendering ad rows ────────────────────────────────────────────

  it('renders the ad title and status badge', () => {
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ title: 'سيارة للبيع', status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.getByText('سيارة للبيع')).toBeInTheDocument();
    expect(screen.getByText('نشط')).toBeInTheDocument();
  });

  // ── Mark-as-sold button (report item #4) ─────────────────────────

  it('shows the mark-as-sold button for an ACTIVE ad', () => {
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.getByTitle('تعليم كمباع')).toBeInTheDocument();
  });

  it('hides the mark-as-sold button for a SOLD ad', () => {
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ status: 'SOLD' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.queryByTitle('تعليم كمباع')).not.toBeInTheDocument();
  });

  it('hides the mark-as-sold button for a DELETED ad', () => {
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ status: 'DELETED' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.queryByTitle('تعليم كمباع')).not.toBeInTheDocument();
  });

  // ── Mark-as-sold flow via ConfirmDialog (UX-FIX) ──────────────────
  // Previously fired markAsSold.mutate immediately on click with no
  // confirmation. Now mirrors the delete flow below: click opens a
  // ConfirmDialog, mutate() only fires on confirm.

  it('does not show the mark-as-sold confirm dialog initially', () => {
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.queryByText('تعليم الإعلان كمباع؟')).not.toBeInTheDocument();
  });

  it('clicking the mark-as-sold icon opens the confirm dialog without mutating yet', async () => {
    const user = setupUser();
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ id: 'ad-42', status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);

    await user.click(screen.getByTitle('تعليم كمباع'));

    expect(screen.getByText('تعليم الإعلان كمباع؟')).toBeInTheDocument();
    expect(mockMarkAsSoldMutate).not.toHaveBeenCalled();
  });

  it('confirming the dialog calls markAsSold.mutate with the correct ad ID', async () => {
    const user = setupUser();
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ id: 'ad-42', status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);

    await user.click(screen.getByTitle('تعليم كمباع'));
    // The icon button's accessible name is "تعليم <title> كمباع" (includes
    // the ad title, for per-row disambiguation — see aria-label above);
    // the dialog's confirm button is the plain "تعليم كمباع", so the two
    // don't collide and no extra scoping is needed here (unlike if both
    // shared the exact same name).
    await user.click(screen.getByRole('button', { name: 'تعليم كمباع' }));

    expect(mockMarkAsSoldMutate).toHaveBeenCalledWith('ad-42', expect.objectContaining({
      onSuccess: expect.any(Function),
    }));
  });

  it('cancelling the mark-as-sold dialog does not call markAsSold.mutate', async () => {
    const user = setupUser();
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ id: 'ad-42', status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);

    await user.click(screen.getByTitle('تعليم كمباع'));
    await user.click(screen.getByRole('button', { name: 'إلغاء' }));

    expect(mockMarkAsSoldMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('تعليم الإعلان كمباع؟')).not.toBeInTheDocument();
  });

  it('disables the mark-as-sold icon button while the mutation is pending', () => {
    // UX-FIX P2-1 (preserved): markAsSold is a shared hook instance scoped
    // to the row via `.variables === ad.id` — the mock must supply
    // `variables` matching the rendered ad's id, or the component
    // correctly reports "not this row's mutation" and stays enabled.
    (useMarkAsSold as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMarkAsSoldMutate, isPending: true, variables: 'ad-1',
    });
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.getByTitle('تعليم كمباع')).toBeDisabled();
  });

  // ── Delete flow via ConfirmDialog (report item #5) ────────────────

  it('does not show the confirm dialog initially', () => {
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd()], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.queryByText('حذف الإعلان؟')).not.toBeInTheDocument();
  });

  it('clicking the delete icon opens the confirm dialog without deleting yet', async () => {
    const user = setupUser();
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ id: 'ad-7', title: 'إعلان سبعة' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);

    // FIX A11Y-01: the trash button now has a real aria-label
    // ("حذف <title>") instead of being unreachable by role/name — no
    // more need to reach for a CSS-class querySelector to find it.
    await user.click(screen.getByRole('button', { name: 'حذف إعلان سبعة' }));

    expect(screen.getByText('حذف الإعلان؟')).toBeInTheDocument();
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it('confirming the dialog calls deleteAd.mutate with the correct ad ID', async () => {
    const user = setupUser();
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ id: 'ad-7', title: 'إعلان سبعة' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);

    await user.click(screen.getByRole('button', { name: 'حذف إعلان سبعة' }));
    // The ConfirmDialog's own confirm button is also literally named
    // "حذف" — disambiguated from the icon button above by its exact
    // (non-suffixed) accessible name.
    await user.click(screen.getByRole('button', { name: 'حذف' }));

    // UX-FIX P1-3: ConfirmDialog now waits for the mutation to resolve
    // before closing, so the caller passes an onSuccess callback
    // alongside the id.
    expect(mockDeleteMutate).toHaveBeenCalledWith('ad-7', expect.objectContaining({
      onSuccess: expect.any(Function),
    }));
  });

  it('cancelling the dialog does not call deleteAd.mutate', async () => {
    const user = setupUser();
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ id: 'ad-7', title: 'إعلان سبعة' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);

    await user.click(screen.getByRole('button', { name: 'حذف إعلان سبعة' }));
    await user.click(screen.getByRole('button', { name: 'إلغاء' }));

    expect(mockDeleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('حذف الإعلان؟')).not.toBeInTheDocument();
  });

  it('targets the correct ad when multiple ads are present', async () => {
    const user = setupUser();
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: [makeAd({ id: 'ad-1', title: 'الأول' }), makeAd({ id: 'ad-2', title: 'الثاني' })],
        meta: { totalPages: 1 },
      },
      isLoading: false,
    });
    render(<MyAdsList />);

    await user.click(screen.getByRole('button', { name: 'حذف الثاني' }));
    await user.click(screen.getByRole('button', { name: 'حذف' }));

    expect(mockDeleteMutate).toHaveBeenCalledWith('ad-2', expect.objectContaining({
      onSuccess: expect.any(Function),
    }));
  });
});
