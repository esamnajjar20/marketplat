/**
 * __tests__/components/PwaBootstrap.test.tsx
 *
 * Coverage gap: 0% prior coverage on the single PWA mount point.
 * Covers that it registers the service worker on mount, replays the
 * offline queue on mount/'online'/tab-visible (FIX OFFLINE-REPLAY-01 —
 * see PwaBootstrap.tsx's own comment: queued items were only ever
 * flushed on a live offline→online transition or Background Sync,
 * neither of which fires when the app is simply reopened/foregrounded
 * after connectivity was already restored while it was closed/
 * backgrounded), cleans up those listeners on unmount, and renders
 * both InstallPrompt and UpdatePrompt. The effect-ordering comment in
 * the source (UpdatePrompt must mount/run its effect before
 * registerServiceWorker fires) is a render-order property, not
 * independently assertable via mocks here — this suite verifies the
 * observable behaviors instead.
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

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('PwaBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisibility('visible');
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

  it('replays the offline queue immediately on mount (FIX OFFLINE-REPLAY-01 — covers the app being reopened after connectivity was already restored while closed)', () => {
    render(<PwaBootstrap />);

    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
  });

  it('replays the offline queue again when the browser goes online', () => {
    render(<PwaBootstrap />);
    vi.clearAllMocks(); // isolate the online-event call from the mount-time call above

    window.dispatchEvent(new Event('online'));

    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
  });

  it('replays the offline queue when the tab becomes visible again (FIX OFFLINE-REPLAY-01 — covers a backgrounded/suspended PWA resuming after connectivity returned)', () => {
    render(<PwaBootstrap />);
    vi.clearAllMocks(); // isolate the visibilitychange call from the mount-time call above

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
  });

  it('does not replay on visibilitychange when the tab becomes hidden', () => {
    render(<PwaBootstrap />);
    vi.clearAllMocks();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(requestQueueReplay).not.toHaveBeenCalled();
  });

  it('removes the online and visibilitychange listeners on unmount (no further replay calls)', () => {
    const { unmount } = render(<PwaBootstrap />);
    unmount();
    vi.clearAllMocks(); // isolate post-unmount behavior from the mount-time call above

    window.dispatchEvent(new Event('online'));
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(requestQueueReplay).not.toHaveBeenCalled();
  });
});
