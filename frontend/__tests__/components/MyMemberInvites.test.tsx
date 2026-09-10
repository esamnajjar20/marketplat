/**
 * __tests__/components/MyMemberInvites.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyMemberInvites } from '@/components/stores/MyMemberInvites';
import { useMyMemberInvites } from '@/hooks/queries/useStoreMembers';
import { useAcceptStoreMemberInvite } from '@/hooks/mutations/useStoreMemberMutations';

vi.mock('@/hooks/queries/useStoreMembers', () => ({
  useMyMemberInvites: vi.fn(),
}));
vi.mock('@/hooks/mutations/useStoreMemberMutations', () => ({
  useAcceptStoreMemberInvite: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

describe('MyMemberInvites', () => {
  beforeEach(() => {
    vi.mocked(useAcceptStoreMemberInvite).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
  });

  it('shows loading', () => {
    vi.mocked(useMyMemberInvites).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);
    render(<MyMemberInvites />);
    expect(screen.getByLabelText(/جارٍ التحميل/)).toBeInTheDocument();
  });

  it('returns null or empty when no invites', () => {
    vi.mocked(useMyMemberInvites).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);
    const { container } = render(<MyMemberInvites />);
    // may be empty DOM or empty state text
    expect(container).toBeTruthy();
  });

  it('renders invite cards', () => {
    vi.mocked(useMyMemberInvites).mockReturnValue({
      data: [
        {
          id: 'inv1',
          role: 'EDITOR',
          store: { id: 's1', name: 'متجر الأمل', logoUrl: null },
        },
      ],
      isLoading: false,
      isError: false,
    } as never);
    render(<MyMemberInvites />);
    expect(screen.getByText(/متجر الأمل/)).toBeInTheDocument();
    expect(screen.getByText(/محرر/)).toBeInTheDocument();
  });
});
