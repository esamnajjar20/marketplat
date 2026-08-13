/**
 * __tests__/components/ChatWindow.test.tsx
 *
 * Real logic under test: conversation loading/error states, resolving
 * "the other party" from buyerId (see otherParty()), read-receipt
 * icon (Check vs CheckCheck) shown only for my own messages, the
 * empty-thread state, the block/unblock flow — unblock is a single
 * click while block opens a ConfirmDialog first (mirrors
 * AdminStoresTable/AdminSellersTable's asymmetric-confirm pattern) —
 * and FIX UX-GAP-03's load-older-messages flow (button visibility
 * driven by meta.hasNextPage, page-2 fetch merged above the live
 * page, dedup by message id at the page boundary).
 * MessageInput is mocked out since it owns its own mutation hook
 * (useSendMessage) that's out of scope here — only its `disabled` prop
 * (driven by isBlocked) is asserted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatWindow } from '@/components/messages/ChatWindow';
import { useConversation, useMessages } from '@/hooks/queries/useConversations';
import { useIsUserBlocked } from '@/hooks/queries/useBlockedUsers';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import { useDeleteMessage } from '@/hooks/mutations/useConversationMutations';
import { useIsUserOnline } from '@/hooks/queries/usePresence';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/hooks/queries/useConversations', () => ({
  useConversation: vi.fn(),
  useMessages: vi.fn(),
}));

vi.mock('@/hooks/queries/useBlockedUsers', () => ({
  useIsUserBlocked: vi.fn(),
}));

vi.mock('@/hooks/mutations/useBlockedUsersMutations', () => ({
  useToggleUserBlock: vi.fn(),
}));

vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useDeleteMessage: vi.fn(),
}));

vi.mock('@/hooks/queries/usePresence', () => ({
  useIsUserOnline: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('@/components/messages/MessageInput', () => ({
  MessageInput: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="message-input" data-disabled={String(!!disabled)} />
  ),
}));

const mockUseConversation = vi.mocked(useConversation);
const mockUseMessages = vi.mocked(useMessages);
const mockUseIsUserBlocked = vi.mocked(useIsUserBlocked);
const mockUseToggleUserBlock = vi.mocked(useToggleUserBlock);
const mockUseDeleteMessage = vi.mocked(useDeleteMessage);
const mockUseIsUserOnline = vi.mocked(useIsUserOnline);
const mockUseAuthStore = vi.mocked(useAuthStore);

const me = { id: 'user-me', name: 'أنا' };
const seller = { id: 'user-seller', name: 'متجر سارة', avatarUrl: null };

const conversation = {
  id: 'conv-1',
  buyerId: me.id,
  buyer: me,
  seller,
  ad: { title: 'دراجة للبيع' },
};

const mockToggleBlockMutate = vi.fn();
const mockDeleteMessageMutate = vi.fn();

function mockAuthState(user: typeof me | null) {
  mockUseAuthStore.mockImplementation((selector: (s: { user: unknown }) => unknown) => selector({ user }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState(me);
  mockUseIsUserBlocked.mockReturnValue(false);
  mockUseIsUserOnline.mockReturnValue(false);
  mockUseToggleUserBlock.mockReturnValue({ mutate: mockToggleBlockMutate, isPending: false } as never);
  mockUseDeleteMessage.mockReturnValue({ mutate: mockDeleteMessageMutate, isPending: false } as never);
  mockUseMessages.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
  mockUseConversation.mockReturnValue({ data: conversation, isLoading: false, isError: false } as never);
});

describe('ChatWindow', () => {
  it('shows a loading spinner while the conversation is loading', () => {
    mockUseConversation.mockReturnValue({ data: undefined, isLoading: true, isError: false } as never);
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with a link back to messages on failure', () => {
    mockUseConversation.mockReturnValue({ data: undefined, isLoading: false, isError: true } as never);
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getByText('تعذّر تحميل المحادثة')).toBeInTheDocument();
    expect(screen.getByText('العودة للمحادثات').closest('a')).toHaveAttribute('href', '/messages');
  });

  it('shows the error state when conversation data is missing even without isError', () => {
    mockUseConversation.mockReturnValue({ data: undefined, isLoading: false, isError: false } as never);
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getByText('تعذّر تحميل المحادثة')).toBeInTheDocument();
  });

  it("renders the other party's name (seller, since I am the buyer) and the ad subject", () => {
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getByText('متجر سارة')).toBeInTheDocument();
    expect(screen.getByText('بخصوص: دراجة للبيع')).toBeInTheDocument();
  });

  it('resolves the other party as the buyer when I am the seller', () => {
    mockAuthState(seller as never);
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getByText('أنا')).toBeInTheDocument();
  });

  it('shows the empty-thread state when there are no messages', () => {
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getByText('ابدأ المحادثة')).toBeInTheDocument();
  });

  it('shows a loading spinner for messages while the thread itself has loaded', () => {
    mockUseMessages.mockReturnValue({ data: undefined, isLoading: true } as never);
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('renders message bodies and shows a read/sent icon only for my own messages', () => {
    mockUseMessages.mockReturnValue({
      data: {
        items: [
          { id: 'm1', senderId: me.id, body: 'مرحبا', createdAt: new Date().toISOString(), readAt: null },
          { id: 'm2', senderId: seller.id, body: 'أهلاً بك', createdAt: new Date().toISOString(), readAt: null },
        ],
      },
      isLoading: false,
    } as never);
    render(<ChatWindow conversationId="conv-1" />);

    expect(screen.getByText('مرحبا')).toBeInTheDocument();
    expect(screen.getByText('أهلاً بك')).toBeInTheDocument();
    // Only my own message (m1, unread) gets a "تم الإرسال" sent-icon.
    expect(screen.getByLabelText('تم الإرسال')).toBeInTheDocument();
    expect(screen.queryByLabelText('تمت القراءة')).not.toBeInTheDocument();
  });

  it('shows the read-receipt icon for my own read message', () => {
    mockUseMessages.mockReturnValue({
      data: {
        items: [
          { id: 'm1', senderId: me.id, body: 'مرحبا', createdAt: new Date().toISOString(), readAt: new Date().toISOString() },
        ],
      },
      isLoading: false,
    } as never);
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getByLabelText('تمت القراءة')).toBeInTheDocument();
  });

  it('passes disabled=false to MessageInput when the other party is not blocked', () => {
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getByTestId('message-input')).toHaveAttribute('data-disabled', 'false');
  });

  it('passes disabled=true to MessageInput when the other party is blocked', () => {
    mockUseIsUserBlocked.mockReturnValue(true);
    render(<ChatWindow conversationId="conv-1" />);
    expect(screen.getByTestId('message-input')).toHaveAttribute('data-disabled', 'true');
  });

  describe('block / unblock', () => {
    it('unblocking is a single click with no confirmation dialog', async () => {
      mockUseIsUserBlocked.mockReturnValue(true);
      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);

      await user.click(screen.getByLabelText('خيارات المحادثة'));
      await user.click(await screen.findByText('إلغاء حظر المستخدم'));

      expect(mockToggleBlockMutate).toHaveBeenCalledWith(seller.id);
      expect(screen.queryByText(`حظر ${seller.name}؟`)).not.toBeInTheDocument();
    });

    it('clicking block opens the confirm dialog without blocking yet', async () => {
      mockUseIsUserBlocked.mockReturnValue(false);
      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);

      await user.click(screen.getByLabelText('خيارات المحادثة'));
      await user.click(await screen.findByText('حظر المستخدم'));

      expect(screen.getByText(`حظر ${seller.name}؟`)).toBeInTheDocument();
      expect(mockToggleBlockMutate).not.toHaveBeenCalled();
    });

    it('confirming the block dialog calls toggleBlock with the party id', async () => {
      mockUseIsUserBlocked.mockReturnValue(false);
      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);

      await user.click(screen.getByLabelText('خيارات المحادثة'));
      await user.click(await screen.findByText('حظر المستخدم'));
      await user.click(screen.getByRole('button', { name: 'حظر' }));

      expect(mockToggleBlockMutate).toHaveBeenCalledWith(
        seller.id,
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('cancelling the block dialog does not toggle the block', async () => {
      mockUseIsUserBlocked.mockReturnValue(false);
      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);

      await user.click(screen.getByLabelText('خيارات المحادثة'));
      await user.click(await screen.findByText('حظر المستخدم'));
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockToggleBlockMutate).not.toHaveBeenCalled();
      expect(screen.queryByText(`حظر ${seller.name}؟`)).not.toBeInTheDocument();
    });
  });

  describe('online presence', () => {
    it('does not show the online indicator when the other party is offline', () => {
      mockUseIsUserOnline.mockReturnValue(false);
      render(<ChatWindow conversationId="conv-1" />);
      expect(screen.queryByLabelText('متصل الآن')).not.toBeInTheDocument();
    });

    it('shows the online indicator when the other party is online', () => {
      mockUseIsUserOnline.mockReturnValue(true);
      render(<ChatWindow conversationId="conv-1" />);
      expect(screen.getAllByLabelText('متصل الآن').length).toBeGreaterThan(0);
    });

    it('queries presence for the resolved other party id, not the caller', () => {
      render(<ChatWindow conversationId="conv-1" />);
      expect(mockUseIsUserOnline).toHaveBeenCalledWith(seller.id);
    });
  });

  describe('delete message', () => {
    const myLiveMessage = {
      id: 'm1',
      senderId: me.id,
      body: 'مرحبا',
      createdAt: new Date().toISOString(),
      readAt: null,
      deletedAt: null,
    };
    const theirLiveMessage = {
      id: 'm2',
      senderId: seller.id,
      body: 'أهلاً بك',
      createdAt: new Date().toISOString(),
      readAt: null,
      deletedAt: null,
    };
    const myDeletedMessage = {
      id: 'm3',
      senderId: me.id,
      body: '', // already redacted by the backend
      createdAt: new Date().toISOString(),
      readAt: null,
      deletedAt: new Date().toISOString(),
    };

    it('shows a delete option only on my own live messages, not the other party\'s', async () => {
      mockUseMessages.mockReturnValue({
        data: { items: [myLiveMessage, theirLiveMessage] },
        isLoading: false,
      } as never);
      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);

      const messageOptionButtons = screen.getAllByLabelText('خيارات الرسالة');
      expect(messageOptionButtons).toHaveLength(1);

      await user.click(messageOptionButtons[0]);
      expect(await screen.findByText('حذف الرسالة')).toBeInTheDocument();
    });

    it('does not show a delete option on an already-deleted message', () => {
      mockUseMessages.mockReturnValue({
        data: { items: [myDeletedMessage] },
        isLoading: false,
      } as never);
      render(<ChatWindow conversationId="conv-1" />);

      expect(screen.queryByLabelText('خيارات الرسالة')).not.toBeInTheDocument();
    });

    it('renders the placeholder text instead of the body for a deleted message', () => {
      mockUseMessages.mockReturnValue({
        data: { items: [myDeletedMessage] },
        isLoading: false,
      } as never);
      render(<ChatWindow conversationId="conv-1" />);

      expect(screen.getByText('تم حذف هذه الرسالة')).toBeInTheDocument();
    });

    it('does not show the sent/read icon on a deleted message', () => {
      mockUseMessages.mockReturnValue({
        data: { items: [myDeletedMessage] },
        isLoading: false,
      } as never);
      render(<ChatWindow conversationId="conv-1" />);

      expect(screen.queryByLabelText('تم الإرسال')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('تمت القراءة')).not.toBeInTheDocument();
    });

    it('clicking delete opens a confirm dialog without deleting yet', async () => {
      mockUseMessages.mockReturnValue({
        data: { items: [myLiveMessage] },
        isLoading: false,
      } as never);
      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);

      await user.click(screen.getByLabelText('خيارات الرسالة'));
      await user.click(await screen.findByText('حذف الرسالة'));

      expect(screen.getByText('حذف هذه الرسالة؟')).toBeInTheDocument();
      expect(mockDeleteMessageMutate).not.toHaveBeenCalled();
    });

    it('confirming delete calls the mutation with the message id', async () => {
      mockUseMessages.mockReturnValue({
        data: { items: [myLiveMessage] },
        isLoading: false,
      } as never);
      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);

      await user.click(screen.getByLabelText('خيارات الرسالة'));
      await user.click(await screen.findByText('حذف الرسالة'));
      await user.click(screen.getByRole('button', { name: 'حذف' }));

      expect(mockDeleteMessageMutate).toHaveBeenCalledWith(
        'm1',
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('cancelling the delete dialog does not call the mutation', async () => {
      mockUseMessages.mockReturnValue({
        data: { items: [myLiveMessage] },
        isLoading: false,
      } as never);
      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);

      await user.click(screen.getByLabelText('خيارات الرسالة'));
      await user.click(await screen.findByText('حذف الرسالة'));
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockDeleteMessageMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('حذف هذه الرسالة؟')).not.toBeInTheDocument();
    });
  });

  describe('load older messages', () => {
    const oldMessage = {
      id: 'old-1',
      senderId: seller.id,
      body: 'رسالة قديمة',
      createdAt: new Date('2026-01-01').toISOString(),
      readAt: null,
      deletedAt: null,
    };
    const recentMessage = {
      id: 'recent-1',
      senderId: me.id,
      body: 'رسالة حديثة',
      createdAt: new Date().toISOString(),
      readAt: null,
      deletedAt: null,
    };

    it('does not show "تحميل رسائل أقدم" when the live page has no further pages', () => {
      mockUseMessages.mockReturnValue({
        data: { items: [recentMessage], meta: { hasNextPage: false } },
        isLoading: false,
        isFetching: false,
      } as never);
      render(<ChatWindow conversationId="conv-1" />);

      expect(screen.queryByText('تحميل رسائل أقدم')).not.toBeInTheDocument();
    });

    it('shows "تحميل رسائل أقدم" when more history exists beyond the live page', () => {
      mockUseMessages.mockReturnValue({
        data: { items: [recentMessage], meta: { hasNextPage: true } },
        isLoading: false,
        isFetching: false,
      } as never);
      render(<ChatWindow conversationId="conv-1" />);

      expect(screen.getByText('تحميل رسائل أقدم')).toBeInTheDocument();
    });

    it('fetches page 2 and prepends older messages above the live page on click', async () => {
      // Both calls to useMessages share one mock in this test file, so
      // this simulates the sequence: first render uses the live-page
      // args (no `page`), then re-renders after olderPage is set use
      // the page:2 args — mockImplementation lets each call's args
      // decide which page's data comes back, matching what the real
      // hook does per query key.
      mockUseMessages.mockImplementation(((_id: string, params?: { page?: number }) => {
        if (params?.page === 2) {
          return {
            data: { items: [oldMessage], meta: { hasNextPage: false } },
            isLoading: false,
            isFetching: false,
          };
        }
        return {
          data: { items: [recentMessage], meta: { hasNextPage: true } },
          isLoading: false,
          isFetching: false,
        };
      }) as never);

      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);

      expect(screen.queryByText('رسالة قديمة')).not.toBeInTheDocument();

      await user.click(screen.getByText('تحميل رسائل أقدم'));

      expect(await screen.findByText('رسالة قديمة')).toBeInTheDocument();
      expect(screen.getByText('رسالة حديثة')).toBeInTheDocument();
      // The load-older button disappears once the fetched older page
      // itself reports no further pages (hasNextPage: false above).
      expect(screen.queryByText('تحميل رسائل أقدم')).not.toBeInTheDocument();
    });

    it('does not duplicate a message that appears in both the live and an older page fetch', async () => {
      mockUseMessages.mockImplementation(((_id: string, params?: { page?: number }) => {
        if (params?.page === 2) {
          // Same id as the live page's item — simulates the boundary
          // overlap the component's dedup-by-id logic guards against.
          return {
            data: { items: [recentMessage], meta: { hasNextPage: false } },
            isLoading: false,
            isFetching: false,
          };
        }
        return {
          data: { items: [recentMessage], meta: { hasNextPage: true } },
          isLoading: false,
          isFetching: false,
        };
      }) as never);

      const user = userEvent.setup();
      render(<ChatWindow conversationId="conv-1" />);
      await user.click(screen.getByText('تحميل رسائل أقدم'));

      await screen.findByText('رسالة حديثة');
      expect(screen.getAllByText('رسالة حديثة')).toHaveLength(1);
    });
  });
});
