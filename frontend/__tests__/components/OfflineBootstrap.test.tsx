/**
 * __tests__/components/OfflineBootstrap.test.tsx
 *
 * الكود المصدر يمرّر التسخين عبر offlineWarmingScheduler (FIX WARM-SCHEDULE-01)
 * والـ pipeline — وهذا الاختبار كان ما زال يفترض استدعاء warmCoreBundle/
 * warmRouteShells مباشرة وبشكل متزامن عند الـ mount (لم يعد صحيحًا منذ
 * WARM-PIPELINE-01). أُعيدت كتابته ليختبر عقد المكوّن الفعلي: أي محفّز
 * يستدعي أي دالة، لا تفاصيل التسخين نفسها (لها اختباراتها).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const auth = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock('@/lib/offlineQueue', () => ({
  requestQueueReplay: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/offlineDraftPublisher', () => ({
  syncPendingOfflineDrafts: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}));
vi.mock('@/lib/offlinePublishFeedback', () => ({
  toastDraftPublishResult: vi.fn(),
}));
vi.mock('@/lib/offlineAdDraftSync', () => ({ initAdDraftSync: vi.fn() }));
vi.mock('@/lib/swTokenSync', () => ({ initSwTokenSync: vi.fn() }));
vi.mock('@/lib/offlineWarmingPipeline', () => ({
  setQueueReplayInFlight: vi.fn(),
}));
vi.mock('@/lib/offlineWarmingScheduler', () => ({
  scheduleWarming: vi.fn(),
  cancelScheduledWarming: vi.fn(),
  TICK_MS: 10 * 60 * 1000,
}));
vi.mock('@/lib/pwa', () => ({
  ensurePushSubscriptionSynced: vi.fn().mockResolvedValue('skipped'),
}));
vi.mock('@/lib/runtime/capabilities', () => ({
  supportsWebPush: vi.fn().mockResolvedValue(true),
  supportsNativePush: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/capacitor/nativePush', () => ({
  ensureNativePushSynced: vi.fn().mockResolvedValue('skipped'),
}));
vi.mock('@/store/auth.store', () => {
  const useAuthStore = Object.assign(
    vi.fn((selector: (s: { isAuthenticated: boolean }) => unknown) =>
      selector({ isAuthenticated: auth.isAuthenticated }),
    ),
    { getState: () => ({ isAuthenticated: auth.isAuthenticated }) },
  );
  return {
    useAuthStore,
    selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  };
});
vi.mock('@/components/pwa/WarmupIndicator', () => ({
  WarmupIndicator: () => <div data-testid="warmup-indicator" />,
}));

import { OfflineBootstrap } from '@/components/pwa/OfflineBootstrap';
import { requestQueueReplay } from '@/lib/offlineQueue';
import { initAdDraftSync } from '@/lib/offlineAdDraftSync';
import { scheduleWarming, cancelScheduledWarming, TICK_MS } from '@/lib/offlineWarmingScheduler';
import { ensurePushSubscriptionSynced } from '@/lib/pwa';
import { supportsWebPush, supportsNativePush } from '@/lib/runtime/capabilities';
import { ensureNativePushSynced } from '@/lib/capacitor/nativePush';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('OfflineBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supportsWebPush).mockResolvedValue(true);
    vi.mocked(supportsNativePush).mockResolvedValue(false);
    setVisibility('visible');
    auth.isAuthenticated = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders WarmupIndicator', () => {
    const { getByTestId } = render(<OfflineBootstrap />);
    expect(getByTestId('warmup-indicator')).toBeInTheDocument();
  });

  it('inits ad-draft sync and SCHEDULES (does not immediately run) warming on mount', () => {
    render(<OfflineBootstrap />);

    expect(initAdDraftSync).toHaveBeenCalledTimes(1);
    expect(scheduleWarming).toHaveBeenCalledWith('mount', { authenticated: false });
  });

  it('replays the offline queue immediately on mount (FIX OFFLINE-REPLAY-01)', () => {
    render(<OfflineBootstrap />);
    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
  });

  it('replays the queue AND schedules warming when the browser goes online', () => {
    render(<OfflineBootstrap />);
    vi.clearAllMocks();

    window.dispatchEvent(new Event('online'));

    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
    expect(scheduleWarming).toHaveBeenCalledWith('online', { authenticated: false });
  });

  it('replays the queue AND schedules a freshness top-up when the tab becomes visible', () => {
    render(<OfflineBootstrap />);
    vi.clearAllMocks();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
    expect(scheduleWarming).toHaveBeenCalledWith('visible', { authenticated: false });
  });

  it('does nothing when the tab becomes hidden', () => {
    render(<OfflineBootstrap />);
    vi.clearAllMocks();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(requestQueueReplay).not.toHaveBeenCalled();
    expect(scheduleWarming).not.toHaveBeenCalled();
  });

  it('schedules a top-up when restored from the back/forward cache (pageshow persisted)', () => {
    render(<OfflineBootstrap />);
    vi.clearAllMocks();

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(scheduleWarming).toHaveBeenCalledWith('visible', { authenticated: false });

    vi.clearAllMocks();
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(scheduleWarming).not.toHaveBeenCalled();
  });

  it('runs a freshness tick every TICK_MS while visible (replaces the 6h timer)', () => {
    vi.useFakeTimers();
    render(<OfflineBootstrap />);
    vi.mocked(scheduleWarming).mockClear();

    vi.advanceTimersByTime(TICK_MS);
    expect(scheduleWarming).toHaveBeenCalledWith('tick', { authenticated: false });
  });

  it('skips the tick while the tab is hidden', () => {
    vi.useFakeTimers();
    render(<OfflineBootstrap />);
    vi.mocked(scheduleWarming).mockClear();

    setVisibility('hidden');
    vi.advanceTimersByTime(TICK_MS);
    expect(scheduleWarming).not.toHaveBeenCalledWith('tick', expect.anything());
  });

  it('on unmount: cancels the pending warming run and removes every listener', () => {
    const { unmount } = render(<OfflineBootstrap />);
    unmount();
    expect(cancelScheduledWarming).toHaveBeenCalled();
    vi.clearAllMocks();

    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(requestQueueReplay).not.toHaveBeenCalled();
    expect(scheduleWarming).not.toHaveBeenCalled();
  });

  it('signed out: no auth trigger and no push sync', () => {
    render(<OfflineBootstrap />);

    expect(scheduleWarming).not.toHaveBeenCalledWith('auth', expect.anything());
    expect(ensurePushSubscriptionSynced).not.toHaveBeenCalled();
  });

  it('signed in: schedules the authenticated run and syncs push', async () => {
    auth.isAuthenticated = true;
    render(<OfflineBootstrap />);

    expect(scheduleWarming).toHaveBeenCalledWith('mount', { authenticated: true });
    expect(scheduleWarming).toHaveBeenCalledWith('auth', { authenticated: true });
    await vi.waitFor(() => {
      expect(ensurePushSubscriptionSynced).toHaveBeenCalledTimes(1);
    });
  });

  it('does not sync Web Push when supportsWebPush is false (e.g. Native / FCM path)', async () => {
    vi.mocked(supportsWebPush).mockResolvedValue(false);
    auth.isAuthenticated = true;
    render(<OfflineBootstrap />);

    await Promise.resolve();
    await Promise.resolve();
    expect(ensurePushSubscriptionSynced).not.toHaveBeenCalled();
    expect(ensureNativePushSynced).not.toHaveBeenCalled();
  });

  it('syncs native FCM when supportsNativePush is true and signed in', async () => {
    vi.mocked(supportsWebPush).mockResolvedValue(false);
    vi.mocked(supportsNativePush).mockResolvedValue(true);
    auth.isAuthenticated = true;
    render(<OfflineBootstrap />);

    await vi.waitFor(() => {
      expect(ensureNativePushSynced).toHaveBeenCalledTimes(1);
    });
    expect(ensurePushSubscriptionSynced).not.toHaveBeenCalled();
  });
});
