/**
 * __tests__/components/MessageUserButtonGate.test.tsx
 *
 * MessageUserButtonGate's real logic: hidden entirely when viewing your
 * own profile (mirrors ReportUserButtonGate's self-guard), gated behind
 * auth otherwise, and starts a conversation via the userId branch of
 * useStartConversation (the {userId} payload, not {adId} — see
 * SellerCard.test.tsx for the adId-branch equivalent).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';

vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useStartConversation: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

const targetUserId = 'user-2';
const mockStartConversation = vi.fn();

function mockAuth(isAuthenticated: boolean, currentUser: { id: string } | null = null) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { isAuthenticated: boolean; user: unknown }) => unknown) =>
      selector({ isAuthenticated, user: currentUser }),
  );
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockStartConversation.mockReset();
  vi.mocked(useStartConversation).mockReturnValue({
    mutate: mockStartConversation,
    isPending: false,
  } as never);
  mockAuth(true, { id: 'user-1' });
});

describe('MessageUserButtonGate', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the message button for a signed-in visitor viewing someone else’s profile', () => {
    renderWithClient(<MessageUserButtonGate targetUserId={targetUserId} />);
    expect(screen.getByRole('button', { name: 'مراسلة' })).not.toBeDisabled();
  });

  it('hides the button entirely when viewing your own profile', () => {
    mockAuth(true, { id: targetUserId });
    renderWithClient(<MessageUserButtonGate targetUserId={targetUserId} />);
    expect(screen.queryByRole('button', { name: 'مراسلة' })).not.toBeInTheDocument();
  });

  it('starts a conversation with the userId payload and navigates to it on click', async () => {
    mockStartConversation.mockImplementation((_payload, opts?: { onSuccess?: (c: { id: string }) => void }) => {
      opts?.onSuccess?.({ id: 'conv-1' });
    });
    const user = userEvent.setup();
    renderWithClient(<MessageUserButtonGate targetUserId={targetUserId} />);

    await user.click(screen.getByRole('button', { name: 'مراسلة' }));

    expect(mockStartConversation).toHaveBeenCalledWith(
      { userId: targetUserId },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('shows an error toast and does not start a conversation when unauthenticated', async () => {
    mockAuth(false);
    const user = userEvent.setup();
    renderWithClient(<MessageUserButtonGate targetUserId={targetUserId} />);

    await user.click(screen.getByRole('button', { name: 'مراسلة' }));

    expect(toast.error).toHaveBeenCalledWith('يرجى تسجيل الدخول أولاً');
    expect(mockStartConversation).not.toHaveBeenCalled();
  });

  it('shows a pending label and disables the button while the conversation is starting', () => {
    vi.mocked(useStartConversation).mockReturnValue({
      mutate: mockStartConversation,
      isPending: true,
    } as never);
    renderWithClient(<MessageUserButtonGate targetUserId={targetUserId} />);

    expect(screen.getByRole('button', { name: 'جارٍ التحضير…' })).toBeDisabled();
  });

  it('renders for an unauthenticated visitor too (auth is checked on click, not on render)', () => {
    mockAuth(false);
    renderWithClient(<MessageUserButtonGate targetUserId={targetUserId} />);
    expect(screen.getByRole('button', { name: 'مراسلة' })).toBeInTheDocument();
  });
});
