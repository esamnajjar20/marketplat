/**
 * __tests__/components/BlockUserButtonGate.test.tsx
 *
 * BlockUserButtonGate's real logic: hidden entirely when signed out or
 * viewing your own profile (same self-guard shape as
 * ReportUserButtonGate / MessageUserButtonGate), blocking asks for
 * confirmation first while unblocking does not (mirrors ChatWindow's
 * handleToggleBlock asymmetry), and the label/icon flip with the
 * current blocked state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BlockUserButtonGate } from '@/components/profile/BlockUserButtonGate';
import { useIsUserBlocked } from '@/hooks/queries/useBlockedUsers';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/hooks/queries/useBlockedUsers', () => ({
  useIsUserBlocked: vi.fn(),
}));

vi.mock('@/hooks/mutations/useBlockedUsersMutations', () => ({
  useToggleUserBlock: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

const targetUserId = 'user-2';
const targetUserName = 'ليلى حسن';
const mockToggleBlock = vi.fn();

function mockAuth(currentUser: { id: string } | null) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { user: unknown }) => unknown) => selector({ user: currentUser }),
  );
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockToggleBlock.mockReset();
  vi.mocked(useToggleUserBlock).mockReturnValue({
    mutate: mockToggleBlock,
    isPending: false,
  } as never);
  vi.mocked(useIsUserBlocked).mockReturnValue(false);
  mockAuth({ id: 'user-1' });
});

describe('BlockUserButtonGate', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the block button for a signed-in visitor viewing someone else’s profile', () => {
    renderWithClient(
      <BlockUserButtonGate targetUserId={targetUserId} targetUserName={targetUserName} />,
    );
    expect(screen.getByRole('button', { name: 'حظر' })).toBeInTheDocument();
  });

  it('hides the button entirely when viewing your own profile', () => {
    mockAuth({ id: targetUserId });
    renderWithClient(
      <BlockUserButtonGate targetUserId={targetUserId} targetUserName={targetUserName} />,
    );
    expect(screen.queryByRole('button', { name: 'حظر' })).not.toBeInTheDocument();
  });

  it('hides the button entirely when signed out', () => {
    mockAuth(null);
    renderWithClient(
      <BlockUserButtonGate targetUserId={targetUserId} targetUserName={targetUserName} />,
    );
    expect(screen.queryByRole('button', { name: 'حظر' })).not.toBeInTheDocument();
  });

  it('shows a confirmation dialog before blocking, and does not call toggleBlock until confirmed', async () => {
    const user = setupUser();
    renderWithClient(
      <BlockUserButtonGate targetUserId={targetUserId} targetUserName={targetUserName} />,
    );

    await user.click(screen.getByRole('button', { name: 'حظر' }));

    expect(screen.getByText(`حظر ${targetUserName}؟`)).toBeInTheDocument();
    expect(mockToggleBlock).not.toHaveBeenCalled();

    // The trigger button and the dialog's confirm button share the same
    // "حظر" label — once the dialog is open there are two, and the
    // confirm button (inside the dialog) is the second one.
    const blockButtons = screen.getAllByRole('button', { name: 'حظر' });
    await user.click(blockButtons[blockButtons.length - 1]);

    expect(mockToggleBlock).toHaveBeenCalledWith(
      targetUserId,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('unblocks immediately without a confirmation dialog when already blocked', async () => {
    vi.mocked(useIsUserBlocked).mockReturnValue(true);
    const user = setupUser();
    renderWithClient(
      <BlockUserButtonGate targetUserId={targetUserId} targetUserName={targetUserName} />,
    );

    await user.click(screen.getByRole('button', { name: 'إلغاء الحظر' }));

    expect(mockToggleBlock).toHaveBeenCalledWith(targetUserId);
    expect(screen.queryByText(`حظر ${targetUserName}؟`)).not.toBeInTheDocument();
  });

  it('disables the button while a toggle is pending', () => {
    vi.mocked(useToggleUserBlock).mockReturnValue({
      mutate: mockToggleBlock,
      isPending: true,
    } as never);
    renderWithClient(
      <BlockUserButtonGate targetUserId={targetUserId} targetUserName={targetUserName} />,
    );

    expect(screen.getByRole('button', { name: 'حظر' })).toBeDisabled();
  });
});
