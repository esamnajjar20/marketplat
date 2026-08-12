/**
 * __tests__/components/UpdatePrompt.test.tsx
 *
 * Real logic under test: renders nothing until
 * onServiceWorkerUpdate's callback fires with a registration, then
 * renders the update banner; clicking "تحديث الآن" calls
 * activateWaitingServiceWorker with that exact registration; and the
 * subscription is cleaned up (the unsubscribe function returned by
 * onServiceWorkerUpdate is called) on unmount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt';
import { onServiceWorkerUpdate, activateWaitingServiceWorker } from '@/lib/pwa';

vi.mock('@/lib/pwa', () => ({
  onServiceWorkerUpdate: vi.fn(),
  activateWaitingServiceWorker: vi.fn(),
}));

const mockOnServiceWorkerUpdate = vi.mocked(onServiceWorkerUpdate);
const mockActivate = vi.mocked(activateWaitingServiceWorker);
const mockUnsubscribe = vi.fn();

const fakeRegistration = { waiting: {} } as unknown as ServiceWorkerRegistration;

describe('UpdatePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnServiceWorkerUpdate.mockReturnValue(mockUnsubscribe);
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
  });

  it('calls activateWaitingServiceWorker with the exact registration on click', async () => {
    let capturedListener: (reg: ServiceWorkerRegistration) => void = () => {};
    mockOnServiceWorkerUpdate.mockImplementation((listener) => {
      capturedListener = listener;
      return mockUnsubscribe;
    });

    const user = userEvent.setup();
    render(<UpdatePrompt />);
    act(() => {
      capturedListener(fakeRegistration);
    });

    await user.click(await screen.findByRole('button', { name: 'تحديث الآن' }));

    expect(mockActivate).toHaveBeenCalledWith(fakeRegistration);
  });

  it('unsubscribes the listener on unmount', () => {
    const { unmount } = render(<UpdatePrompt />);
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
