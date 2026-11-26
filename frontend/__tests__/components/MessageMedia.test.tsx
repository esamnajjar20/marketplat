import { describe, expect, it, vi } from 'vitest';
import type { ImgHTMLAttributes } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageMedia } from '@/components/messages/MessageMedia';
import type { DisplayMessage } from '@/components/messages/messageTypes';

vi.mock('@/components/shared/ui/SafeImg', () => ({
  SafeImg: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

vi.mock('@/components/messages/MessageImageViewer', () => ({
  MessageImageViewer: ({
    images,
    onOpenChange,
  }: {
    images: Array<{ imageUrl: string }>;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog" aria-label="عارض الصورة" data-image-url={images[0]?.imageUrl}>
      <button type="button" onClick={() => onOpenChange(false)}>إغلاق عارض الصورة</button>
    </div>
  ),
}));

vi.mock('@/components/ui/spinner', () => ({ Spinner: () => <span /> }));
vi.mock('@/api/conversations.api', () => ({ conversationsApi: { downloadMedia: vi.fn() } }));

const message: DisplayMessage = {
  id: 'message-image-1',
  conversationId: 'conversation-1',
  senderId: 'user-1',
  body: '📷',
  imageUrl: 'https://res.cloudinary.com/example/image/upload/chat/photo.jpg',
  readAt: null,
  deletedAt: null,
  createdAt: '2026-11-26T10:00:00.000Z',
};

describe('MessageMedia image preview', () => {
  it('opens the image inside the conversation instead of navigating to Cloudinary', async () => {
    const user = userEvent.setup();
    const view = render(<MessageMedia message={message} conversationId="conversation-1" isMine />);

    expect(view.container.querySelector('a[href*="res.cloudinary.com"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /فتح الصورة/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'معاينة الصورة بالحجم الكامل' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'معاينة الصورة بالحجم الكامل' }));

    expect(screen.getByRole('dialog', { name: 'عارض الصورة' })).toHaveAttribute(
      'data-image-url',
      message.imageUrl,
    );
  });

  it('closes the in-app preview without changing the page URL', async () => {
    const user = userEvent.setup();
    render(<MessageMedia message={message} conversationId="conversation-1" isMine />);
    await user.click(screen.getByRole('button', { name: 'معاينة الصورة بالحجم الكامل' }));
    await user.click(screen.getByRole('button', { name: 'إغلاق عارض الصورة' }));

    expect(screen.queryByRole('dialog', { name: 'عارض الصورة' })).not.toBeInTheDocument();
  });
});
