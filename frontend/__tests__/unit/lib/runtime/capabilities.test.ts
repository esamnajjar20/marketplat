/**
 * __tests__/unit/lib/runtime/capabilities.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  supportsServiceWorker,
  supportsWebPush,
  supportsNativePush,
  supportsAppBadge,
  supportsInstallPrompt,
} from '@/lib/runtime/capabilities';
import { isNativePlatform } from '@/lib/capacitor/platform';
import { isPushSupported } from '@/lib/pwa';

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => false),
}));

vi.mock('@/lib/pwa', () => ({
  isPushSupported: vi.fn(() => true),
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

describe('runtime/capabilities', () => {
  beforeEach(() => {
    vi.mocked(isNativePlatform).mockResolvedValue(false);
    vi.mocked(isPushSupported).mockReturnValue(true);
    mockMatchMedia(false);
    Object.defineProperty(window.navigator, 'standalone', {
      value: undefined,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('supportsServiceWorker reflects navigator.serviceWorker', () => {
    expect(supportsServiceWorker()).toBe('serviceWorker' in navigator);
  });

  it('supportsWebPush is false on native', async () => {
    vi.mocked(isNativePlatform).mockResolvedValue(true);
    expect(await supportsWebPush()).toBe(false);
  });

  it('supportsWebPush delegates to isPushSupported on web', async () => {
    vi.mocked(isPushSupported).mockReturnValue(true);
    expect(await supportsWebPush()).toBe(true);
    vi.mocked(isPushSupported).mockReturnValue(false);
    expect(await supportsWebPush()).toBe(false);
  });

  it('supportsNativePush follows isNativePlatform', async () => {
    vi.mocked(isNativePlatform).mockResolvedValue(false);
    expect(await supportsNativePush()).toBe(false);
    vi.mocked(isNativePlatform).mockResolvedValue(true);
    expect(await supportsNativePush()).toBe(true);
  });

  it('supportsInstallPrompt is false on native', async () => {
    vi.mocked(isNativePlatform).mockResolvedValue(true);
    expect(await supportsInstallPrompt()).toBe(false);
  });

  it('supportsInstallPrompt is false in standalone PWA', async () => {
    mockMatchMedia(true);
    expect(await supportsInstallPrompt()).toBe(false);
  });

  it('supportsInstallPrompt is true in browser non-standalone', async () => {
    mockMatchMedia(false);
    expect(await supportsInstallPrompt()).toBe(true);
  });

  it('supportsAppBadge is a feature detect on navigator', () => {
    const result = supportsAppBadge();
    expect(typeof result).toBe('boolean');
  });
});
