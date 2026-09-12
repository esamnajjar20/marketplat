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

  it('shows persistent offline message while offline', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    render(<NetworkStatusBanner />);
    expect(screen.getByText('لا يوجد اتصال بالإنترنت')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows "عاد الاتصال" after transition offline → online', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    const { rerender } = render(<NetworkStatusBanner />);
    expect(screen.getByText('لا يوجد اتصال بالإنترنت')).toBeInTheDocument();

    vi.mocked(useOnlineStatus).mockReturnValue(true);
    rerender(<NetworkStatusBanner />);
    expect(screen.getByText('عاد الاتصال')).toBeInTheDocument();
    expect(screen.queryByText('لا يوجد اتصال بالإنترنت')).not.toBeInTheDocument();
  });

  it('auto-hides back-online after timeout', () => {
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

  it('dismiss button hides the back-online banner', async () => {
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
