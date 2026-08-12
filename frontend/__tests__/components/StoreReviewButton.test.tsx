/**
 * __tests__/components/StoreReviewButton.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers the server-mirroring
 * own-store guard (returns null, no button at all), the
 * unauthenticated redirect-to-login-with-next path (mirrors
 * ServiceRequestButton), and the authenticated path opening the
 * review dialog directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreReviewButton } from '@/components/stores/StoreReviewButton';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/components/stores/StoreReviewDialog', () => ({
  StoreReviewDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="review-dialog" /> : null),
}));

function mockAuth(state: { user: Record<string, unknown> | null; isAuthenticated: boolean }) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
  );
}

describe('StoreReviewButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing on the owner\'s own store', () => {
    mockAuth({ user: { id: 'owner-1' }, isAuthenticated: true });
    const { container } = render(
      <StoreReviewButton storeId="store-1" storeName="متجري" ownerUserId="owner-1" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the review button for a non-owner viewer', () => {
    mockAuth({ user: { id: 'viewer-1' }, isAuthenticated: true });
    render(<StoreReviewButton storeId="store-1" storeName="متجر آخر" ownerUserId="owner-1" />);

    expect(screen.getByRole('button', { name: /إضافة تقييم/ })).toBeInTheDocument();
  });

  it('redirects to login with a next param when unauthenticated', async () => {
    mockAuth({ user: null, isAuthenticated: false });
    const user = userEvent.setup();
    render(<StoreReviewButton storeId="store-1" storeName="متجر آخر" ownerUserId="owner-1" />);

    await user.click(screen.getByRole('button', { name: /إضافة تقييم/ }));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('next='));
    expect(screen.queryByTestId('review-dialog')).not.toBeInTheDocument();
  });

  it('opens the review dialog directly when authenticated', async () => {
    mockAuth({ user: { id: 'viewer-1' }, isAuthenticated: true });
    const user = userEvent.setup();
    render(<StoreReviewButton storeId="store-1" storeName="متجر آخر" ownerUserId="owner-1" />);

    await user.click(screen.getByRole('button', { name: /إضافة تقييم/ }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId('review-dialog')).toBeInTheDocument();
  });
});
