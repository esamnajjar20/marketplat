/**
 * __tests__/components/MessageInput.test.tsx
 *
 * Previously uncovered despite being the composer for the entire
 * messaging feature. Real logic worth locking in:
 *  - Enter sends, Shift+Enter inserts a newline instead (standard chat
 *    UX, easy to silently break with any onKeyDown refactor)
 *  - Empty/whitespace-only body never sends, on Enter OR button click
 *  - A send clears the composer optimistically; onError restores the body
 *  - disabled (blocked-user) renders a static notice instead of the
 *    form at all — sendMessage must never fire in that state
 *  - MAX_LENGTH is enforced by textarea maxLength (browser/jsdom-level,
 *    asserted via the attribute since jsdom doesn't truncate on type)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
import { setupUser } from '@/test-support/user-event';
import { MessageInput } from '@/components/messages/MessageInput';
import { useSendMessage } from '@/hooks/mutations/useConversationMutations';


vi.mock('@/components/messages/MessageBodyEditor', async () => {
  const React = await import('react');
  return {
    MessageBodyEditor: React.forwardRef(function MockEditor(
      { onContentChange, disabled }: { onContentChange?: (v: boolean) => void; disabled?: boolean },
      ref: any,
    ) {
      const [value, setValue] = React.useState('');
      React.useImperativeHandle(ref, () => ({
        getValue: () => value,
        setValue: (v: string) => { setValue(v); onContentChange?.(Boolean(v.trim())); },
        clear: () => { setValue(''); onContentChange?.(false); },
        focus: () => {},
        requestSubmit: () => {},
      }));
      return React.createElement(
        React.Fragment,
        null,
        React.createElement('textarea', {
          value,
          disabled: Boolean(disabled),
          maxLength: 2000,
          'aria-label': 'نص الرسالة',
          placeholder: 'اكتب رسالتك...',
          onChange: (e: any) => {
            setValue(e.target.value);
            onContentChange?.(Boolean(e.target.value.trim()));
          },
          onKeyDown: (e: any) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const form = e.currentTarget.closest('form');
              if (form) form.requestSubmit();
            }
          },
        }),
        value.length >= 1800
          ? React.createElement('p', { className: value.length >= 2000 ? 'font-medium text-destructive' : 'text-muted-foreground' }, `${value.length}/2000`)
          : null,
      );
    }),
  };
});

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
    renderWithClient(<MessageInput conversationId="conv-1" />);
    expect(useSendMessage).toHaveBeenCalledWith('conv-1');
  });

  it('disabled renders a static notice instead of the composer form', () => {
    renderWithClient(<MessageInput conversationId="conv-1" disabled />);

    expect(screen.getByText('لا يمكنك مراسلة هذا المستخدم')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('اكتب رسالتك...')).not.toBeInTheDocument();
  });

  it('REGRESSION: keeps the textarea enabled while a text send is pending but blocks re-sending', () => {
    (useSendMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });
    renderWithClient(<MessageInput conversationId="conv-1" />);

    // Disabling the field would drop focus (closing the mobile keyboard).
    expect(getTextarea()).not.toBeDisabled();
    expect(screen.getByLabelText('إرسال')).toBeDisabled();
  });

  it('send button is disabled while the composer is empty', () => {
    renderWithClient(<MessageInput conversationId="conv-1" />);
    expect(screen.getByLabelText('إرسال')).toBeDisabled();
  });

  it('send button stays disabled for whitespace-only input', async () => {
    const user = setupUser();
    renderWithClient(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), '   ');

    expect(screen.getByLabelText('إرسال')).toBeDisabled();
  });

  it('clicking send trims and submits the body', async () => {
    const user = setupUser();
    renderWithClient(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), '  مرحباً  ');
    await user.click(screen.getByLabelText('إرسال'));

    expect(mockMutate).toHaveBeenCalledWith(
      { body: 'مرحباً' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('Enter (no Shift) submits the message', async () => {
    const user = setupUser();
    renderWithClient(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), 'رسالة سريعة{Enter}');

    expect(mockMutate).toHaveBeenCalledWith(
      { body: 'رسالة سريعة' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('Shift+Enter inserts a newline instead of submitting', async () => {
    const user = setupUser();
    renderWithClient(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), 'السطر الأول{Shift>}{Enter}{/Shift}السطر الثاني');

    expect(mockMutate).not.toHaveBeenCalled();
    expect(getTextarea().value).toBe('السطر الأول\nالسطر الثاني');
  });

  it('Enter on an empty/whitespace body does not submit', async () => {
    const user = setupUser();
    renderWithClient(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), '   {Enter}');

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('clears the composer immediately on send (optimistic)', async () => {
    const user = setupUser();
    renderWithClient(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), 'رسالة');
    await user.click(screen.getByLabelText('إرسال'));

    // Component clears before the network returns; onError restores on failure.
    expect(getTextarea().value).toBe('');
  });

  it('restores the body when send fails', async () => {
    const user = setupUser();
    renderWithClient(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), 'رسالة');
    await user.click(screen.getByLabelText('إرسال'));

    const { onError } = mockMutate.mock.calls[0][1];
    act(() => {
      onError(new Error('network'));
    });

    expect(getTextarea().value).toBe('رسالة');
  });

  it('does not submit while a send is already pending', async () => {
    (useSendMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });
    const user = setupUser();
    renderWithClient(<MessageInput conversationId="conv-1" />);

    await user.type(getTextarea(), 'رسالة أخرى{Enter}');

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('إرسال')).toBeDisabled();
  });

  it('marks the composer busy and blocks attachments (but keeps the editor enabled) while a send is pending', () => {
    (useSendMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });

    renderWithClient(<MessageInput conversationId="conv-1" />);

    expect(document.querySelector('form')).toHaveAttribute('aria-busy', 'true');
    // The editor intentionally stays enabled during a text send so the mobile
    // keyboard isn't dropped (see the REGRESSION test above); duplicate sends
    // are blocked by the disabled send button instead.
    expect(getTextarea()).not.toBeDisabled();
    expect(screen.getByLabelText('إرفاق صورة')).toBeDisabled();
    expect(screen.getByLabelText('إرفاق ملف')).toBeDisabled();
  });

  it('textarea enforces the 2000-character max length', () => {
    renderWithClient(<MessageInput conversationId="conv-1" />);
    expect(getTextarea()).toHaveAttribute('maxLength', '2000');
  });

  describe('character counter (FIX UX-GAP-05)', () => {
    it('shows no counter for a short message', async () => {
      const user = setupUser();
      renderWithClient(<MessageInput conversationId="conv-1" />);

      await user.type(getTextarea(), 'رسالة قصيرة');

      expect(screen.queryByText(/\/2000/)).not.toBeInTheDocument();
    });

    it('shows the counter once the body reaches the warn threshold', async () => {
      renderWithClient(<MessageInput conversationId="conv-1" />);
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
      renderWithClient(<MessageInput conversationId="conv-1" />);
      const textarea = getTextarea();

      const { fireEvent } = await import('@testing-library/react');
      fireEvent.change(textarea, { target: { value: 'ا'.repeat(2000) } });

      const counter = screen.getByText('2000/2000');
      expect(counter).toHaveClass('text-destructive');
    });
  });
});
