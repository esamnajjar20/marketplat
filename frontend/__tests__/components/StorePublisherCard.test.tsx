/**
 * __tests__/components/StorePublisherCard.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { StorePublisherCard } from '@/components/ads/StorePublisherCard';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));
vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useStartConversation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ isAuthenticated: true, user: { id: 'buyer-1' } }),
  ),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  selectUser: (s: { user: unknown }) => s.user,
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

describe('StorePublisherCard', () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(useStartConversation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
  });

  it('renders store name as link', () => {
    render(
      <StorePublisherCard
        adId="ad-1"
        store={{ id: 's1', name: 'متجر الأمل', slug: 'amal' }}
        ownerUserId="owner-1"
      />,
    );
    expect(screen.getByText('متجر الأمل')).toBeInTheDocument();
  });

  it('prompts login when messaging while logged out', async () => {
    vi.mocked(useAuthStore).mockImplementation((sel: unknown) => {
      const fn = sel as (s: unknown) => unknown;
      return fn({ isAuthenticated: false, user: null });
    });
    const user = setupUser();
    render(
      <StorePublisherCard
        adId="ad-1"
        store={{ id: 's1', name: 'متجر' }}
        ownerUserId="owner-1"
      />,
    );
    const btn = screen.getByRole('button', { name: /مراسلة|رسالة/i });
    await user.click(btn);
    expect(toast.error).toHaveBeenCalled();
    expect(push).toHaveBeenCalled();
  });
});
