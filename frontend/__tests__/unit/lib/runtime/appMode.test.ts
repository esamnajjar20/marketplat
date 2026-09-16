/**
 * __tests__/unit/lib/runtime/appMode.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAppMode, isStandaloneMode } from '@/lib/runtime/appMode';
import { isNativePlatform } from '@/lib/capacitor/platform';

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => false),
}));

function mockMatchMedia(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(display-mode: standalone)' ? standalone : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('runtime/appMode', () => {
  beforeEach(() => {
    vi.mocked(isNativePlatform).mockResolvedValue(false);
    mockMatchMedia(false);
    Object.defineProperty(window.navigator, 'standalone', {
      value: undefined,
      configurable: true,
    });
  });

  it('getAppMode returns native when isNativePlatform is true (even if standalone)', async () => {
    vi.mocked(isNativePlatform).mockResolvedValue(true);
    mockMatchMedia(true);
    expect(await getAppMode()).toBe('native');
  });

  it('getAppMode returns pwa when standalone and not native', async () => {
    mockMatchMedia(true);
    expect(await getAppMode()).toBe('pwa');
  });

  it('getAppMode returns browser when not standalone and not native', async () => {
    mockMatchMedia(false);
    expect(await getAppMode()).toBe('browser');
  });

  it('isStandaloneMode reads display-mode and navigator.standalone', () => {
    mockMatchMedia(true);
    expect(isStandaloneMode()).toBe(true);
    mockMatchMedia(false);
    expect(isStandaloneMode()).toBe(false);
  });
});
