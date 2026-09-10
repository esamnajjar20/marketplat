/**
 * __tests__/unit/lib/capacitor-deepLinks.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDeepLinkListener } from '@/lib/capacitor/deepLinks';
import { isNativePlatform } from '@/lib/capacitor/platform';

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => false),
}));

const remove = vi.fn();
const addListener = vi.fn(async (_event: string, cb: (e: { url: string }) => void) => {
  (addListener as unknown as { _cb?: (e: { url: string }) => void })._cb = cb;
  return { remove };
});

vi.mock('@capacitor/app', () => ({
  App: { addListener },
}));

describe('registerDeepLinkListener', () => {
  beforeEach(() => {
    vi.mocked(isNativePlatform).mockResolvedValue(false);
    addListener.mockClear();
    remove.mockClear();
  });

  it('is no-op on web and returns cleanup', async () => {
    const push = vi.fn();
    const cleanup = await registerDeepLinkListener({ push });
    expect(addListener).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it('registers listener on native and routes marketplat:// URLs', async () => {
    vi.mocked(isNativePlatform).mockResolvedValue(true);
    const push = vi.fn();
    const cleanup = await registerDeepLinkListener({ push });
    expect(addListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));

    const cb = (addListener as unknown as { _cb: (e: { url: string }) => void })._cb;
    cb({ url: 'marketplat://ads/123' });
    expect(push).toHaveBeenCalledWith('/ads/123');

    cb({ url: 'https://example.com/stores/s1?x=1' });
    expect(push).toHaveBeenCalledWith('/stores/s1?x=1');

    cb({ url: 'not-a-url' });
    // invalid → no push
    expect(push).toHaveBeenCalledTimes(2);

    cleanup();
    expect(remove).toHaveBeenCalled();
  });
});
