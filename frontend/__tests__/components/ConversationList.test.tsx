/**
 * __tests__/components/ConversationList.test.tsx
 *
 * Real logic under test: loading/error(-with-retry)/empty states,
 * resolving "the other party" from buyerId (mirrors ChatWindow's own
 * otherParty()), falling back to "محادثة عامة" when a conversation has
 * no linked ad, each row's href, and the `selectedId` prop driving
 * `aria-current="page"` / highlight for the DESKTOP-SPLIT-01 split view.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ConversationList } from '@/components/messages/ConversationList';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { usePresence } from '@/hooks/queries/usePresence';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/hooks/queries/useConversations', () => ({
  useMyConversations: vi.fn(),
}));

vi.mock('@/hooks/queries/usePresence', () => ({
  usePresence: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

const mockUseMyConversations = vi.mocked(useMyConversations);
const mockUsePresence = vi.mocked(usePresence);
const mockUseAuthStore = vi.mocked(useAuthStore);

const me = { id: 'user-me', name: 'أنا' };
const seller = { id: 'user-seller', name: 'متجر سارة', avatarUrl: null };
const buyer = { id: 'user-buyer', name: 'خالد', avatarUrl: null };

function mockAuthState(user: typeof me | null) {
  mockUseAuthStore.mockImplementation((selector: (s: { user: unknown }) => unknown) => selector({ user }));
}

function makeConversation(overrides: Partial<{
  id: string; buyerId: string; buyer: typeof buyer; seller: typeof seller;
  ad: { title: string } | null; updatedAt: string; unreadCount: number;
}> = {}) {
  return {
    id: 'conv-1',
    buyerId: me.id,
    buyer: me,
    seller,
    ad: { title: 'دراجة للبيع' },
    updatedAt: new Date().toISOString(),
    // FIX UX-15: defaults to 0 (no badge) so every existing test below
    // — none of which cares about the unread badge — keeps rendering
    // exactly as before; only the new tests further down override it.
    unreadCount: 0,
    ...overrides,
  };
}

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState(me);
    mockUsePresence.mockReturnValue({ data: {} } as never);
  });

  it('shows a loading spinner while fetching', () => {
    mockUseMyConversations.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() } as never);
    render(<ConversationList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with a retry option that calls refetch', async () => {
    const refetch = vi.fn();
    mockUseMyConversations.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch } as never);
    const user = setupUser();
    render(<ConversationList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل المحادثات')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no conversations', () => {
    mockUseMyConversations.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() } as never);
    render(<ConversationList />);
    expect(screen.getByText('لا توجد محادثات بعد')).toBeInTheDocument();
  });

  it("renders the other party's name (seller, since I am the buyer) and links to the conversation", () => {
    mockUseMyConversations.mockReturnValue({
      data: { items: [makeConversation({ id: 'conv-42' })] },
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<ConversationList />);

    expect(screen.getByText('متجر سارة')).toBeInTheDocument();
    expect(screen.getByText('متجر سارة').closest('a')).toHaveAttribute('href', '/messages/conv-42');
  });

  it('resolves the other party as the buyer when I am the seller', () => {
    mockAuthState(seller as never);
    mockUseMyConversations.mockReturnValue({
      data: { items: [makeConversation({ buyerId: buyer.id, buyer })] },
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<ConversationList />);
    expect(screen.getByText('خالد')).toBeInTheDocument();
  });

  it('shows the ad title when the conversation is linked to an ad', () => {
    mockUseMyConversations.mockReturnValue({
      data: { items: [makeConversation({ ad: { title: 'هاتف للبيع' } })] },
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<ConversationList />);
    expect(screen.getByText('هاتف للبيع')).toBeInTheDocument();
  });

  it('falls back to "محادثة عامة" when the conversation has no linked ad', () => {
    mockUseMyConversations.mockReturnValue({
      data: { items: [makeConversation({ ad: null })] },
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<ConversationList />);
    expect(screen.getByText('محادثة عامة')).toBeInTheDocument();
  });

  it('marks the selected conversation with aria-current="page"', () => {
    mockUseMyConversations.mockReturnValue({
      data: {
        items: [
          makeConversation({ id: 'conv-1' }),
          makeConversation({ id: 'conv-2', seller: buyer as never }),
        ],
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<ConversationList selectedId="conv-2" />);

    const links = screen.getAllByRole('link');
    const selectedLink = links.find((l) => l.getAttribute('href') === '/messages/conv-2');
    const otherLink = links.find((l) => l.getAttribute('href') === '/messages/conv-1');

    expect(selectedLink).toHaveAttribute('aria-current', 'page');
    expect(otherLink).not.toHaveAttribute('aria-current');
  });

  it('renders multiple conversations', () => {
    mockUseMyConversations.mockReturnValue({
      data: {
        items: [
          makeConversation({ id: 'conv-1', seller: { ...seller, name: 'متجر أ' } }),
          makeConversation({ id: 'conv-2', seller: { ...seller, name: 'متجر ب' } }),
        ],
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<ConversationList />);

    expect(screen.getByText('متجر أ')).toBeInTheDocument();
    expect(screen.getByText('متجر ب')).toBeInTheDocument();
  });

  describe('online presence', () => {
    it('does not show an online dot when the other party is offline', () => {
      mockUseMyConversations.mockReturnValue({
        data: { items: [makeConversation({ id: 'conv-1' })] },
        isLoading: false, isError: false, refetch: vi.fn(),
      } as never);
      mockUsePresence.mockReturnValue({ data: { [seller.id]: false } } as never);
      render(<ConversationList />);

      expect(screen.queryByLabelText('متصل الآن')).not.toBeInTheDocument();
    });

    it('shows an online dot for a row whose other party is online', () => {
      mockUseMyConversations.mockReturnValue({
        data: { items: [makeConversation({ id: 'conv-1' })] },
        isLoading: false, isError: false, refetch: vi.fn(),
      } as never);
      mockUsePresence.mockReturnValue({ data: { [seller.id]: true } } as never);
      render(<ConversationList />);

      expect(screen.getByLabelText('متصل الآن')).toBeInTheDocument();
    });

    it('requests presence for every row\'s other party id in one call', () => {
      mockUseMyConversations.mockReturnValue({
        data: {
          items: [
            makeConversation({ id: 'conv-1', seller: { ...seller, id: 'seller-a' } }),
            makeConversation({ id: 'conv-2', seller: { ...seller, id: 'seller-b' } }),
          ],
        },
        isLoading: false, isError: false, refetch: vi.fn(),
      } as never);
      render(<ConversationList />);

      expect(mockUsePresence).toHaveBeenCalledWith(['seller-a', 'seller-b']);
    });

    it('only shows the dot for the row whose party is actually online, not every row', () => {
      mockUseMyConversations.mockReturnValue({
        data: {
          items: [
            makeConversation({ id: 'conv-1', seller: { ...seller, id: 'seller-a' } }),
            makeConversation({ id: 'conv-2', seller: { ...seller, id: 'seller-b' } }),
          ],
        },
        isLoading: false, isError: false, refetch: vi.fn(),
      } as never);
      mockUsePresence.mockReturnValue({ data: { 'seller-a': true, 'seller-b': false } } as never);
      render(<ConversationList />);

      expect(screen.getAllByLabelText('متصل الآن')).toHaveLength(1);
    });
  });

  // FIX UX-15: was previously nowhere in this list — a conversation
  // with unread messages looked identical to one without.
  describe('unread badge', () => {
    it('shows no badge when unreadCount is 0', () => {
      mockUseMyConversations.mockReturnValue({
        data: { items: [makeConversation({ unreadCount: 0 })] },
        isLoading: false, isError: false, refetch: vi.fn(),
      } as never);
      render(<ConversationList />);

      expect(screen.queryByLabelText(/رسالة غير مقروءة/)).not.toBeInTheDocument();
    });

    it('shows the exact count when there are unread messages', () => {
      mockUseMyConversations.mockReturnValue({
        data: { items: [makeConversation({ unreadCount: 3 })] },
        isLoading: false, isError: false, refetch: vi.fn(),
      } as never);
      render(<ConversationList />);

      expect(screen.getByLabelText('3 رسالة غير مقروءة')).toHaveTextContent('3');
    });

    it('caps the displayed badge text at "9+" for large counts without losing the real count in aria-label', () => {
      mockUseMyConversations.mockReturnValue({
        data: { items: [makeConversation({ unreadCount: 42 })] },
        isLoading: false, isError: false, refetch: vi.fn(),
      } as never);
      render(<ConversationList />);

      expect(screen.getByLabelText('42 رسالة غير مقروءة')).toHaveTextContent('9+');
    });

    it('only badges the row that actually has unread messages, not every row', () => {
      mockUseMyConversations.mockReturnValue({
        data: {
          items: [
            makeConversation({ id: 'conv-1', unreadCount: 2 }),
            makeConversation({ id: 'conv-2', unreadCount: 0 }),
          ],
        },
        isLoading: false, isError: false, refetch: vi.fn(),
      } as never);
      render(<ConversationList />);

      expect(screen.getAllByLabelText(/رسالة غير مقروءة/)).toHaveLength(1);
    });
  });
});
