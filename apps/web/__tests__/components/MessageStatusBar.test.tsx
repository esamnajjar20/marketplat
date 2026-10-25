import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageStatusBar } from '@/components/messages/MessageStatusBar';
import type { DisplayMessage } from '@/components/messages/messageTypes';

function makeMessage(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderId: 'user-1',
    body: 'مرحبا',
    imageUrl: null,
    readAt: null,
    deletedAt: null,
    createdAt: '2026-10-11T16:00:00.000Z',
    ...overrides,
  };
}

describe('MessageStatusBar accessibility', () => {
  it('announces queued outgoing messages to assistive technology', () => {
    render(<MessageStatusBar message={makeMessage({ clientStatus: 'queued' })} isMine />);
    expect(screen.getByRole('status')).toHaveTextContent('بانتظار الاتصال');
  });

  it('announces a failed outgoing message without relying on an icon label', () => {
    render(<MessageStatusBar message={makeMessage({ clientStatus: 'failed' })} isMine />);
    expect(screen.getByRole('status')).toHaveTextContent('تعذّر الإرسال');
  });

  it('does not announce outgoing delivery status for another participant message', () => {
    render(<MessageStatusBar message={makeMessage({ senderId: 'user-2', clientStatus: 'queued' })} isMine={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
