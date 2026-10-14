/**
 * __tests__/components/MessagesLink.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessagesLink } from '@/components/layout/MessagesLink';
import { useUnreadConversationCount } from '@/hooks/queries/useConversations';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/hooks/queries/useConversations', () => ({
  useUnreadConversationCount: vi.fn(() => ({ data: 0 })),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn((sel: (s: { isAuthenticated: boolean }) => unknown) =>
    sel({ isAuthenticated: true }),
  ),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  selectHasAccessToken: (s: any) => Boolean(s?.accessToken ?? s?.hasAccessToken),
  selectHydratedUser: (s: any) => (s?.isHydrated ? s.user : null),
  selectHydratedIsAuthenticated: (s: any) => (s?.isHydrated ? Boolean(s?.isAuthenticated ?? s?.user) : false),
  selectIsAuthResolving: (s: any) => Boolean(s?.isAuthResolving),
  selectIsHydrated: (s: any) => Boolean(s?.isHydrated),
  selectAccessToken: (s: any) => s?.accessToken,
  selectUser: (s: any) => s?.user,
  selectIsAdmin: (s: any) => Boolean(s?.isAdmin ?? (s?.user?.role === 'ADMIN' || s?.user?.role === 'MODERATOR')),
}));

describe('MessagesLink', () => {
  beforeEach(() => {
    vi.mocked(useUnreadConversationCount).mockReturnValue({ data: 0 } as never);
    vi.mocked(useAuthStore).mockImplementation((sel: unknown) => {
      const fn = sel as (s: { isAuthenticated: boolean }) => unknown;
      return fn({ isAuthenticated: true });
    });
  });

  it('returns null when not authenticated', () => {
    vi.mocked(useAuthStore).mockImplementation((sel: unknown) => {
      const fn = sel as (s: { isAuthenticated: boolean }) => unknown;
      return fn({ isAuthenticated: false });
    });
    const { container } = render(<MessagesLink />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders messages link without badge when no unread', () => {
    render(<MessagesLink />);
    expect(screen.getByLabelText('الرسائل')).toBeInTheDocument();
  });

  it('shows unread count badge', () => {
    vi.mocked(useUnreadConversationCount).mockReturnValue({ data: 5 } as never);
    render(<MessagesLink />);
    expect(screen.getByLabelText(/5 غير مقروءة/)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('caps badge at 99+', () => {
    vi.mocked(useUnreadConversationCount).mockReturnValue({ data: 120 } as never);
    render(<MessagesLink />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });
});
