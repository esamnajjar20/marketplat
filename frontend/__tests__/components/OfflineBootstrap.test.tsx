/**
 * __tests__/components/OfflineBootstrap.test.tsx
 *
 * PLAN-runtime-separation (مرحلة 2/6): استُخرج من PwaBootstrap.test.tsx —
 * queue replay/warming تحديدًا (FIX OFFLINE-REPLAY-01)، بنفس التوقعات
 * تمامًا، بعد أن انتقل الكود المصدر نفسه إلى OfflineBootstrap.tsx بلا أي
 * تغيير سلوكي. يضيف أيضًا تغطية جديدة لمزامنة الشلّات الشخصية/Push
 * المرتبطة بحالة تسجيل الدخول (isAuthenticated) — غير مغطاة سابقًا في
 * PwaBootstrap.test.tsx الأصلي.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { OfflineBootstrap } from '@/components/pwa/OfflineBootstrap';
import { requestQueueReplay } from '@/lib/offlineQueue';
import { initAdDraftSync } from '@/lib/offlineAdDraftSync';
import { warmCoreBundle } from '@/lib/offlineCoreBundle';
import { warmRouteShells, warmPersonalShells } from '@/lib/offlineRouteShells';
import { ensurePushSubscriptionSynced } from '@/lib/pwa';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/lib/offlineQueue', () => ({
  requestQueueReplay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/offlineAdDraftSync', () => ({
  initAdDraftSync: vi.fn(),
}));

vi.mock('@/lib/offlineCoreBundle', () => ({
  warmCoreBundle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/offlineRouteShells', () => ({
  warmRouteShells: vi.fn().mockResolvedValue(undefined),
  warmPersonalShells: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/pwa', () => ({
  ensurePushSubscriptionSynced: vi.fn().mockResolvedValue('skipped'),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('@/components/pwa/WarmupIndicator', () => ({
  WarmupIndicator: () => <div data-testid="warmup-indicator" />,
}));

function mockAuth(isAuthenticated: boolean) {
  vi.mocked(useAuthStore).mockImplementation((selector: unknown) =>
    (selector as (s: { isAuthenticated: boolean }) => unknown)({ isAuthenticated }),
  );
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('OfflineBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisibility('visible');
    mockAuth(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders WarmupIndicator', () => {
    const { getByTestId } = render(<OfflineBootstrap />);
    expect(getByTestId('warmup-indicator')).toBeInTheDocument();
  });

  it('runs ad-draft sync and warms the core bundle/route shells on mount', () => {
    render(<OfflineBootstrap />);

    expect(initAdDraftSync).toHaveBeenCalledTimes(1);
    expect(warmCoreBundle).toHaveBeenCalledTimes(1);
    expect(warmRouteShells).toHaveBeenCalledTimes(1);
  });

  it('replays the offline queue immediately on mount (FIX OFFLINE-REPLAY-01 — covers the app being reopened after connectivity was already restored while closed)', () => {
    render(<OfflineBootstrap />);

    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
  });

  it('replays the offline queue again when the browser goes online', () => {
    render(<OfflineBootstrap />);
    vi.clearAllMocks(); // isolate the online-event call from the mount-time call above

    window.dispatchEvent(new Event('online'));

    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
  });

  it('replays the offline queue when the tab becomes visible again (FIX OFFLINE-REPLAY-01 — covers a backgrounded/suspended PWA resuming after connectivity returned)', () => {
    render(<OfflineBootstrap />);
    vi.clearAllMocks(); // isolate the visibilitychange call from the mount-time call above

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(requestQueueReplay).toHaveBeenCalledTimes(1);
  });

  it('does not replay on visibilitychange when the tab becomes hidden', () => {
    render(<OfflineBootstrap />);
    vi.clearAllMocks();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(requestQueueReplay).not.toHaveBeenCalled();
  });

  it('removes the online and visibilitychange listeners on unmount (no further replay calls)', () => {
    const { unmount } = render(<OfflineBootstrap />);
    unmount();
    vi.clearAllMocks(); // isolate post-unmount behavior from the mount-time call above

    window.dispatchEvent(new Event('online'));
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(requestQueueReplay).not.toHaveBeenCalled();
  });

  it('does not warm personal shells or sync push when signed out', () => {
    mockAuth(false);
    render(<OfflineBootstrap />);

    expect(warmPersonalShells).not.toHaveBeenCalled();
    expect(ensurePushSubscriptionSynced).not.toHaveBeenCalled();
  });

  it('warms personal shells and syncs push once signed in', () => {
    mockAuth(true);
    render(<OfflineBootstrap />);

    expect(warmPersonalShells).toHaveBeenCalledTimes(1);
    expect(ensurePushSubscriptionSynced).toHaveBeenCalledTimes(1);
  });

  it('re-warms personal shells and re-syncs push when back online while signed in', () => {
    mockAuth(true);
    render(<OfflineBootstrap />);
    vi.clearAllMocks();
    mockAuth(true);

    window.dispatchEvent(new Event('online'));

    expect(warmPersonalShells).toHaveBeenCalledTimes(1);
    expect(ensurePushSubscriptionSynced).toHaveBeenCalledTimes(1);
  });
});
