import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useNotificationStream', () => ({
  isNotificationStreamConnected: vi.fn(() => false),
}));

import { isNotificationStreamConnected } from '@/hooks/useNotificationStream';
import { canBackgroundPoll, pollingInterval } from '@/lib/polling';

const streamConnected = vi.mocked(isNotificationStreamConnected);

afterEach(() => {
  streamConnected.mockReturnValue(false);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

describe('background polling policy', () => {
  it('pauses polling when the document is hidden', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });

    expect(canBackgroundPoll()).toBe(false);
    expect(pollingInterval(60_000, 1)).toBe(false);
  });

  it('pauses polling while offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    expect(canBackgroundPoll()).toBe(false);
    expect(pollingInterval(60_000, 1)).toBe(false);
  });

  it('keeps the configured interval when visible and online', () => {
    expect(canBackgroundPoll()).toBe(true);
    expect(pollingInterval(60_000, 1)).toBe(60_000);
  });

  it('stretches backup polling when the notification stream is connected', () => {
    streamConnected.mockReturnValue(true);

    expect(pollingInterval(10_000, 3)).toBe(30_000);
    expect(pollingInterval(10_000, 3, true)).toBe(false);
  });
});
