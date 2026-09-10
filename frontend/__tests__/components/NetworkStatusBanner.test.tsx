/**
 * __tests__/components/NetworkStatusBanner.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { NetworkStatusBanner } from '@/components/shared/NetworkStatusBanner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => true),
}));

describe('NetworkStatusBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(useOnlineStatus).mockReturnValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when already online on mount', () => {
    const { container } = render(<NetworkStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "عاد الاتصال" after transition offline → online', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    const { rerender } = render(<NetworkStatusBanner />);
    expect(screen.queryByText('عاد الاتصال')).not.toBeInTheDocument();

    vi.mocked(useOnlineStatus).mockReturnValue(true);
    rerender(<NetworkStatusBanner />);
    expect(screen.getByText('عاد الاتصال')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('auto-hides after timeout', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    const { rerender } = render(<NetworkStatusBanner />);
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    rerender(<NetworkStatusBanner />);
    expect(screen.getByText('عاد الاتصال')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('عاد الاتصال')).not.toBeInTheDocument();
  });

  it('dismiss button hides the banner', async () => {
    vi.useRealTimers();
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    const { rerender } = render(<NetworkStatusBanner />);
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    rerender(<NetworkStatusBanner />);

    const user = setupUser();
    await user.click(screen.getByLabelText('إغلاق الرسالة'));
    expect(screen.queryByText('عاد الاتصال')).not.toBeInTheDocument();
  });
});
