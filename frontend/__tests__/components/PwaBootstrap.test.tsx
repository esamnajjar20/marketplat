/**
 * __tests__/components/PwaBootstrap.test.tsx
 *
 * Coverage gap: 0% prior coverage on the single PWA mount point.
 * Covers that it registers the service worker on mount, replays the
 * offline queue on the browser 'online' event, cleans up that
 * listener on unmount, and renders both InstallPrompt and
 * UpdatePrompt. The effect-ordering comment in the source (UpdatePrompt
 * must mount/run its effect before registerServiceWorker fires) is a
 * render-order property, not independently assertable via mocks here —
 * this suite verifies the two observable behaviors: SW registration
 * happens, and both children are present in the tree.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { PwaBootstrap } from '@/components/pwa/PwaBootstrap';
import { registerServiceWorker } from '@/lib/pwa';
import { requestQueueReplay } from '@/lib/offlineQueue';

vi.mock('@/lib/pwa', () => ({
  registerServiceWorker: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/offlineQueue', () => ({
  requestQueueReplay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/pwa/InstallPrompt', () => ({
  InstallPrompt: () => <div data-testid="install-prompt" />,
}));

vi.mock('@/components/pwa/UpdatePrompt', () => ({
  UpdatePrompt: () => <div data-testid="update-prompt" />,
}));

describe('PwaBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the service worker on mount', () => {
    render(<PwaBootstrap />);

    expect(registerServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('renders both InstallPrompt and UpdatePrompt', () => {
    const { getByTestId } = render(<PwaBootstrap />);

    expect(getByTestId('install-prompt')).toBeInTheDocument();
    expect(getByTestId('update-prompt')).toBeInTheDocument();
  });

  it('replays the offline queue when the browser goes online', () => {
    render(<PwaBootstrap />);

    window.dispatchEvent(new Event('online'));

    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
  });

  it('removes the online listener on unmount (no further replay calls)', () => {
    const { unmount } = render(<PwaBootstrap />);
    unmount();

    window.dispatchEvent(new Event('online'));

    expect(requestQueueReplay).not.toHaveBeenCalled();
  });
});
