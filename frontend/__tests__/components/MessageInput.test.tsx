/**
 * __tests__/components/MessageInput.test.tsx
 *
 * Previously uncovered despite being the composer for the entire
 * messaging feature. Real logic worth locking in:
 *  - Enter sends, Shift+Enter inserts a newline instead (standard chat
 *    UX, easy to silently break with any onKeyDown refactor)
 *  - Empty/whitespace-only body never sends, on Enter OR button click
 *  - A successful send clears the composer (onSuccess), a pending or
 *    failed one does not
 *  - disabled (blocked-user) renders a static notice instead of the
 *    form at all — sendMessage must never fire in that state
 *  - MAX_LENGTH is enforced by textarea maxLength (browser/jsdom-level,
 *    asserted via the attribute since jsdom doesn't truncate on type)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '@/components/messages/MessageInput';
import { useSendMessage } from '@/hooks/mutations/useConversationMutations';

vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useSendMessage: vi.fn(),
}));

const mockMutate = vi.fn();

function getTextarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText('اكتب رسالتك...') as HTMLTextAreaElement;
}

describe('MessageInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSendMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('calls useSendMessage with the conversation id', () => {
    render(<MessageInput conversationId="conv-1" />);
    expect(useSendMessage).toHaveBeenCalledWith('conv-1');
  });

  it('disabled renders a static notice instead of the composer form', () => {
    render(<MessageInput conversationId="conv-1" disabled />);

    expect(screen.getByText('لا يمكنك مراسلة هذا المستخدم')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('اكتب رسالتك...')).not.toBeInTheDocument();
  });

  it('send button is disabled while the composer is empty', () => {
    render(<MessageInput conversationId="conv-1" />);
    expect(screen.getByLabelText('إرسال')).toBeDisabled();
  });

  it('send button stays disabled for whitespace-only input', async () => {
    const user = userEvent.setup();
    render(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), '   ');

    expect(screen.getByLabelText('إرسال')).toBeDisabled();
  });

  it('clicking send trims and submits the body', async () => {
    const user = userEvent.setup();
    render(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), '  مرحباً  ');
    await user.click(screen.getByLabelText('إرسال'));

    expect(mockMutate).toHaveBeenCalledWith(
      { body: 'مرحباً' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('Enter (no Shift) submits the message', async () => {
    const user = userEvent.setup();
    render(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), 'رسالة سريعة{Enter}');

    expect(mockMutate).toHaveBeenCalledWith(
      { body: 'رسالة سريعة' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('Shift+Enter inserts a newline instead of submitting', async () => {
    const user = userEvent.setup();
    render(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), 'السطر الأول{Shift>}{Enter}{/Shift}السطر الثاني');

    expect(mockMutate).not.toHaveBeenCalled();
    expect(getTextarea().value).toBe('السطر الأول\nالسطر الثاني');
  });

  it('Enter on an empty/whitespace body does not submit', async () => {
    const user = userEvent.setup();
    render(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), '   {Enter}');

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('onSuccess clears the composer', async () => {
    const user = userEvent.setup();
    render(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), 'رسالة');
    await user.click(screen.getByLabelText('إرسال'));

    const { onSuccess } = mockMutate.mock.calls[0][1];
    act(() => {
      onSuccess();
    });

    expect(getTextarea().value).toBe('');
  });

  it('does not submit while a send is already pending', async () => {
    (useSendMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });
    const user = userEvent.setup();
    render(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), 'رسالة أخرى{Enter}');

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('إرسال')).toBeDisabled();
  });

  it('textarea enforces the 2000-character max length', () => {
    render(<MessageInput conversationId="conv-1" />);
    expect(getTextarea()).toHaveAttribute('maxLength', '2000');
  });

  describe('character counter (FIX UX-GAP-05)', () => {
    it('shows no counter for a short message', async () => {
      const user = userEvent.setup();
      render(<MessageInput conversationId="conv-1" />);

      await user.type(getTextarea(), 'رسالة قصيرة');

      expect(screen.queryByText(/\/2000/)).not.toBeInTheDocument();
    });

    it('shows the counter once the body reaches the warn threshold', async () => {
      render(<MessageInput conversationId="conv-1" />);
      const textarea = getTextarea();

      // userEvent.type is too slow for 1800 chars in a unit test —
      // fireEvent-style direct value + change event covers the same
      // component logic (the counter reads body.length, not how it
      // got there).
      const { fireEvent } = await import('@testing-library/react');
      fireEvent.change(textarea, { target: { value: 'ا'.repeat(1800) } });

      expect(screen.getByText('1800/2000')).toBeInTheDocument();
    });

    it('marks the counter as destructive once the body hits the max length', async () => {
      render(<MessageInput conversationId="conv-1" />);
      const textarea = getTextarea();

      const { fireEvent } = await import('@testing-library/react');
      fireEvent.change(textarea, { target: { value: 'ا'.repeat(2000) } });

      const counter = screen.getByText('2000/2000');
      expect(counter).toHaveClass('text-destructive');
    });
  });
});
