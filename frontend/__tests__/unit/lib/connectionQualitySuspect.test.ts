/**
 * __tests__/unit/lib/connectionQualitySuspect.test.ts
 *
 * CONNECTIVITY-SUSPECT-01: "online per the browser, but requests keep
 * failing" is derived from the existing failure streak — no probing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/networkObservability', () => ({
  recordConnectionSnapshot: vi.fn(),
  recordRequestCompleted: vi.fn(),
  recordRequestStarted: vi.fn(),
}));

type Mod = typeof import('@/lib/connectionQuality');
let m: Mod;

function setOnLine(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
}

describe('isConnectivitySuspect', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setOnLine(true);
    m = await import('@/lib/connectionQuality');
  });
  afterEach(() => vi.useRealTimers());

  it('is false below 3 consecutive network failures', () => {
    m.recordRequestFailure(100, 'network');
    m.recordRequestFailure(100, 'network');
    expect(m.isConnectivitySuspect()).toBe(false);
  });

  it('is true at 3 consecutive network failures while navigator is online', () => {
    for (let i = 0; i < 3; i++) m.recordRequestFailure(100, 'network');
    expect(m.isConnectivitySuspect()).toBe(true);
  });

  it('ignores http-level failures (server answered, so the internet works)', () => {
    for (let i = 0; i < 5; i++) m.recordRequestFailure(100, 'http');
    expect(m.isConnectivitySuspect()).toBe(false);
  });

  it('is false when the browser already reports offline', () => {
    for (let i = 0; i < 3; i++) m.recordRequestFailure(100, 'network');
    setOnLine(false);
    expect(m.isConnectivitySuspect()).toBe(false);
  });

  it('clears on a successful request and notifies subscribers', () => {
    for (let i = 0; i < 3; i++) m.recordRequestFailure(100, 'network');
    const listener = vi.fn();
    m.subscribeConnectionQuality(listener);
    m.recordRequestSuccess();
    expect(m.isConnectivitySuspect()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify on success when nothing was suspect', () => {
    const listener = vi.fn();
    m.subscribeConnectionQuality(listener);
    m.recordRequestSuccess();
    expect(listener).not.toHaveBeenCalled();
  });

  it('expires once the failure streak is older than the window', () => {
    for (let i = 0; i < 3; i++) m.recordRequestFailure(100, 'network');
    vi.advanceTimersByTime(m.SUSPECT_WINDOW_MS + 1);
    expect(m.isConnectivitySuspect()).toBe(false);
  });
});
