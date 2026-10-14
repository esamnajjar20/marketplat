/**
 * __tests__/components/NetworkStatusBanner.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { NetworkStatusBanner } from '@/components/shared/NetworkStatusBanner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useConnectivitySuspect } from '@/hooks/useConnectivitySuspect';

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => true),
}));
vi.mock('@/hooks/useConnectivitySuspect', () => ({
  useConnectivitySuspect: vi.fn(() => false),
}));

describe('NetworkStatusBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useConnectivitySuspect).mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when already online on mount', () => {
    const { container } = render(<NetworkStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows full offline message then compact badge', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    render(<NetworkStatusBanner />);
    expect(screen.getByText('لا يوجد اتصال بالإنترنت')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'المحفوظات' })).toHaveAttribute('href', '/offline?tab=saved');
    expect(screen.getByRole('link', { name: 'المسودات' })).toHaveAttribute('href', '/offline?tab=drafts');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('لا يوجد اتصال بالإنترنت')).not.toBeInTheDocument();
    expect(screen.getByText('غير متصل')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'فتح المحفوظات دون اتصال' })).toHaveAttribute('href', '/offline?tab=saved');
  });

  it('shows "عاد الاتصال" after transition offline → online', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    const { rerender } = render(<NetworkStatusBanner />);
    expect(screen.getByText('لا يوجد اتصال بالإنترنت')).toBeInTheDocument();

    vi.mocked(useOnlineStatus).mockReturnValue(true);
    rerender(<NetworkStatusBanner />);
    expect(screen.getByText('عاد الاتصال')).toBeInTheDocument();
    expect(screen.queryByText('لا يوجد اتصال بالإنترنت')).not.toBeInTheDocument();
    expect(screen.queryByText('غير متصل')).not.toBeInTheDocument();
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

  it('shows the warning chip when online but connectivity is suspect', () => {
    vi.mocked(useConnectivitySuspect).mockReturnValue(true);
    render(<NetworkStatusBanner />);
    expect(screen.getByText('الاتصال لا يستجيب')).toBeInTheDocument();
    expect(screen.queryByText('لا يوجد اتصال بالإنترنت')).not.toBeInTheDocument();
    expect(screen.queryByText('غير متصل')).not.toBeInTheDocument();
  });

  it('shows no warning chip when connectivity is not suspect', () => {
    render(<NetworkStatusBanner />);
    expect(screen.queryByText('الاتصال لا يستجيب')).not.toBeInTheDocument();
  });
});
