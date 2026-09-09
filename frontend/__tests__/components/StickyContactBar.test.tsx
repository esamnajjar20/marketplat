/**
 * StickyContactBar — mobile contact CTA on ad detail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { StickyContactBar } from '@/components/ads/StickyContactBar';
import { useAuthStore } from '@/store/auth.store';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { toast } from 'sonner';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: any) => s.user,
  selectIsAuthenticated: (s: any) => s.isAuthenticated,
}));

vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useStartConversation: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const seller = { id: 'seller-1', name: 'بائع' };

describe('StickyContactBar', () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useStartConversation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('renders nothing for the ad owner', () => {
    vi.mocked(useAuthStore).mockImplementation((sel: any) =>
      typeof sel === 'function'
        ? sel({ user: { id: 'seller-1' }, isAuthenticated: true })
        : true,
    );
    const { container } = render(
      <StickyContactBar adId="ad-1" price="100" seller={seller as any} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows price and message button for other users', () => {
    vi.mocked(useAuthStore).mockImplementation((sel: any) =>
      typeof sel === 'function'
        ? sel({ user: { id: 'buyer-1' }, isAuthenticated: true })
        : true,
    );
    render(<StickyContactBar adId="ad-1" price="250" seller={seller as any} />);
    expect(screen.getByLabelText('تواصل سريع مع البائع')).toBeInTheDocument();
  });

  it('toasts when unauthenticated user tries to message', async () => {
    vi.mocked(useAuthStore).mockImplementation((sel: any) =>
      typeof sel === 'function'
        ? sel({ user: null, isAuthenticated: false })
        : false,
    );
    const user = setupUser();
    render(<StickyContactBar adId="ad-1" price="100" seller={seller as any} />);
    await user.click(screen.getByRole('button', { name: /راسل البائع|مراسلة/ }));
    expect(toast.error).toHaveBeenCalledWith('سجّل الدخول لتراسل البائع');
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('starts a conversation when authenticated', async () => {
    vi.mocked(useAuthStore).mockImplementation((sel: any) =>
      typeof sel === 'function'
        ? sel({ user: { id: 'buyer-1' }, isAuthenticated: true })
        : true,
    );
    const user = setupUser();
    render(<StickyContactBar adId="ad-1" price="100" seller={seller as any} />);
    await user.click(screen.getByRole('button', { name: /راسل البائع|مراسلة/ }));
    expect(mockMutate).toHaveBeenCalledWith(
      { adId: 'ad-1' },
      expect.any(Object),
    );
  });
});
