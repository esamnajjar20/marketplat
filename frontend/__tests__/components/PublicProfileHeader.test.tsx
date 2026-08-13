/**
 * __tests__/components/PublicProfileHeader.test.tsx
 *
 * PublicProfileHeader's real logic: conditionally renders city and bio
 * (both nullable), always shows the member-since date and ad count,
 * regardless of whether the optional fields are present.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicProfileHeader } from '@/components/profile/PublicProfileHeader';
import { useAuthStore } from '@/store/auth.store';
import type { PublicUser } from '@/types/user.types';

// PublicProfileHeader now renders MessageUserButtonGate alongside
// ReportUserButtonGate — both are client components reading auth state
// and (for the message button) a react-query mutation. Mocked here the
// same way SellerCard.test.tsx / MessageUserButtonGate.test.tsx mock
// them, so this file's existing assertions about name/city/bio/ad-count
// keep working unaffected by that addition.
vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useStartConversation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn((selector: (s: { isAuthenticated: boolean; user: unknown }) => unknown) =>
    selector({ isAuthenticated: false, user: null }),
  ),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

function makeUser(overrides: Partial<PublicUser>): PublicUser {
  return {
    id: 'u1',
    name: 'ليلى حسن',
    city: 'خان يونس',
    bio: null,
    avatarUrl: null,
    createdAt: '2024-01-15T00:00:00.000Z',
    _count: { ads: 7 },
    ...overrides,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(useAuthStore).mockImplementation(
    (selector: (s: { isAuthenticated: boolean; user: unknown }) => unknown) =>
      selector({ isAuthenticated: false, user: null }),
  );
});

describe('PublicProfileHeader', () => {
  it('renders the user name', () => {
    renderWithClient(<PublicProfileHeader user={makeUser({ name: 'ليلى حسن' })} />);
    expect(screen.getByRole('heading', { name: 'ليلى حسن' })).toBeInTheDocument();
  });

  it('shows the city when present', () => {
    renderWithClient(<PublicProfileHeader user={makeUser({ city: 'خان يونس' })} />);
    expect(screen.getByText('خان يونس')).toBeInTheDocument();
  });

  it('does not render any city text when city is null', () => {
    renderWithClient(<PublicProfileHeader user={makeUser({ city: null, bio: null })} />);
    expect(screen.queryByText('خان يونس')).not.toBeInTheDocument();
  });

  it('shows the bio when present', () => {
    renderWithClient(<PublicProfileHeader user={makeUser({ bio: 'بائع موثوق منذ سنوات' })} />);
    expect(screen.getByText('بائع موثوق منذ سنوات')).toBeInTheDocument();
  });

  it('renders no bio paragraph when bio is null', () => {
    renderWithClient(<PublicProfileHeader user={makeUser({ bio: null })} />);
    expect(screen.queryByText(/بائع موثوق/)).not.toBeInTheDocument();
  });

  it('always shows the ad count regardless of optional fields', () => {
    renderWithClient(<PublicProfileHeader user={makeUser({ city: null, bio: null, _count: { ads: 12 } })} />);
    // The count and its "إعلان" label render as two separate <span>
    // elements (not one text node), so a single-node regex can't match
    // "12 إعلان" — check each piece individually instead.
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('إعلان')).toBeInTheDocument();
  });

  it('always shows the member-since date', () => {
    renderWithClient(<PublicProfileHeader user={makeUser({})} />);
    expect(screen.getByText(/عضو منذ/)).toBeInTheDocument();
  });

  it('shows the message button for a visitor viewing someone else’s profile', () => {
    renderWithClient(<PublicProfileHeader user={makeUser({ id: 'other-user' })} />);
    expect(screen.getByRole('button', { name: 'مراسلة' })).toBeInTheDocument();
  });

  it('hides the message button when viewing your own profile', () => {
    vi.mocked(useAuthStore).mockImplementation(
      (selector: (s: { isAuthenticated: boolean; user: unknown }) => unknown) =>
        selector({ isAuthenticated: true, user: { id: 'u1' } }),
    );
    renderWithClient(<PublicProfileHeader user={makeUser({ id: 'u1' })} />);
    expect(screen.queryByRole('button', { name: 'مراسلة' })).not.toBeInTheDocument();
  });
});
