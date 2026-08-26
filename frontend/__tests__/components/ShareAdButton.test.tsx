/**
 * ShareAdButton — WhatsApp / Telegram / copy link.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('ShareAdButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('opens the menu with WhatsApp and Telegram options', async () => {
    const user = setupUser();
    render(<ShareAdButton title="إعلان" url="https://example.com/ad/1" />);
    await user.click(screen.getByLabelText('مشاركة'));
    expect(screen.getByText('واتساب')).toBeInTheDocument();
    expect(screen.getByText('تيليجرام')).toBeInTheDocument();
    expect(screen.getByText('نسخ الرابط')).toBeInTheDocument();
  });

  it('opens WhatsApp with title and url in the text', async () => {
    const user = setupUser();
    render(<ShareAdButton title="سيارة" url="https://example.com/ad/99" />);
    await user.click(screen.getByLabelText('مشاركة'));
    await user.click(screen.getByText('واتساب'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('wa.me'),
      '_blank',
      'noopener,noreferrer',
    );
    const url = (window.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain('سيارة');
    expect(decodeURIComponent(url)).toContain('https://example.com/ad/99');
  });

  it('opens Telegram share url', async () => {
    const user = setupUser();
    render(<ShareAdButton title="منتج" url="https://example.com/p" />);
    await user.click(screen.getByLabelText('مشاركة'));
    await user.click(screen.getByText('تيليجرام'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('t.me/share/url'),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('copies the link and toasts success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    });

    const user = setupUser();
    render(<ShareAdButton title="إعلان" url="https://example.com/ad/1" />);
    await user.click(screen.getByLabelText('مشاركة'));
    await user.click(screen.getByText('نسخ الرابط'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('تم نسخ الرابط');
    });
  });

  it('renders button variant with text label', () => {
    render(<ShareAdButton title="إعلان" variant="button" />);
    expect(screen.getByRole('button', { name: /مشاركة/ })).toBeInTheDocument();
  });
});
