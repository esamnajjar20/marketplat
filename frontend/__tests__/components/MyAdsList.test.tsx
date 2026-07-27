/**
 * __tests__/components/MyAdsList.test.tsx
 *
 * Coverage targets:
 *  - Loading state shows a spinner
 *  - Empty state shown when there are no ads
 *  - Renders each ad's title, price, status badge
 *  - Mark-as-sold button (report item #4):
 *      * shown only for ACTIVE ads
 *      * hidden for SOLD/DELETED ads
 *      * clicking it calls markAsSold.mutate with the ad's ID directly
 *        (no confirmation needed for this non-destructive action)
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
import userEvent from '@testing-library/user-event';
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
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<MyAdsList />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows the empty state when there are no ads', () => {
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);
    expect(screen.getByText('لا توجد إعلانات')).toBeInTheDocument();
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

  it('calls markAsSold.mutate with the ad ID immediately on click (no confirmation step)', async () => {
    const user = userEvent.setup();
    (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeAd({ id: 'ad-42', status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyAdsList />);

    await user.click(screen.getByTitle('تعليم كمباع'));
    expect(mockMarkAsSoldMutate).toHaveBeenCalledWith('ad-42');
  });

  it('disables the mark-as-sold button while the mutation is pending', () => {
    (useMarkAsSold as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockMarkAsSoldMutate, isPending: true });
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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

    expect(mockDeleteMutate).toHaveBeenCalledWith('ad-7');
  });

  it('cancelling the dialog does not call deleteAd.mutate', async () => {
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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

    expect(mockDeleteMutate).toHaveBeenCalledWith('ad-2');
  });
});
