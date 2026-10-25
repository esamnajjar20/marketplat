/**
 * __tests__/components/UpdatePrompt.test.tsx
 *
 * Real logic under test: renders nothing until onServiceWorkerUpdate's
 * callback fires with a registration, then renders the update banner;
 * "تحديث الآن" now links to /update (the update page owns activation +
 * progress) instead of activating instantly; dismiss hides the banner;
 * and the subscription is cleaned up on unmount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt';
import { onServiceWorkerUpdate } from '@/lib/pwa';

vi.mock('@/lib/pwa', () => ({
  onServiceWorkerUpdate: vi.fn(),
  activateWaitingServiceWorker: vi.fn(),
}));

const mockOnServiceWorkerUpdate = vi.mocked(onServiceWorkerUpdate);
const mockUnsubscribe = vi.fn();

const fakeRegistration = { waiting: {} } as unknown as ServiceWorkerRegistration;

describe('UpdatePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnServiceWorkerUpdate.mockReturnValue(mockUnsubscribe);
    localStorage.clear();
  });

  it('renders nothing before an update is available', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the update banner once the listener reports a waiting registration', () => {
    let capturedListener: (reg: ServiceWorkerRegistration) => void = () => {};
    mockOnServiceWorkerUpdate.mockImplementation((listener) => {
      capturedListener = listener;
      return mockUnsubscribe;
    });

    render(<UpdatePrompt />);
    expect(screen.queryByText('يتوفر تحديث جديد للتطبيق')).not.toBeInTheDocument();

    act(() => {
      capturedListener(fakeRegistration);
    });
    expect(screen.getByText('يتوفر تحديث جديد للتطبيق')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تحديث الآن' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إخفاء الإشعار' })).toBeInTheDocument();
  });

  it('links "تحديث الآن" to the /update page instead of activating instantly', () => {
    let capturedListener: (reg: ServiceWorkerRegistration) => void = () => {};
    mockOnServiceWorkerUpdate.mockImplementation((listener) => {
      capturedListener = listener;
      return mockUnsubscribe;
    });

    render(<UpdatePrompt />);
    act(() => {
      capturedListener(fakeRegistration);
    });

    const link = screen.getByRole('link', { name: 'تحديث الآن' });
    expect(link).toHaveAttribute('href', '/update');
  });

  it('hides the banner when dismiss is clicked', async () => {
    let capturedListener: (reg: ServiceWorkerRegistration) => void = () => {};
    mockOnServiceWorkerUpdate.mockImplementation((listener) => {
      capturedListener = listener;
      return mockUnsubscribe;
    });

    const user = setupUser();
    render(<UpdatePrompt />);
    act(() => {
      capturedListener(fakeRegistration);
    });

    expect(screen.getByText('يتوفر تحديث جديد للتطبيق')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إخفاء الإشعار' }));
    expect(screen.queryByText('يتوفر تحديث جديد للتطبيق')).not.toBeInTheDocument();
  });

  it('unsubscribes the listener on unmount', () => {
    const { unmount } = render(<UpdatePrompt />);
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
