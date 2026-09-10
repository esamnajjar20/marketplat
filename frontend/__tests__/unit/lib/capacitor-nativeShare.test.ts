/**
 * __tests__/unit/lib/capacitor-nativeShare.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const shareMock = vi.fn();
const canShareMock = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => 'android'),
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: (...args: unknown[]) => shareMock(...args),
    canShare: (...args: unknown[]) => canShareMock(...args),
  },
}));

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => true),
}));

describe('nativeShare', () => {
  beforeEach(() => {
    shareMock.mockReset();
    canShareMock.mockReset();
    vi.resetModules();
  });

  it('shares via Capacitor Share plugin', async () => {
    shareMock.mockResolvedValue(undefined);
    const { nativeShare } = await import('@/lib/capacitor/nativeShare');
    const ok = await nativeShare({ title: 'إعلان', text: 'شاهد', url: 'https://x.test/1' });
    expect(ok).toBe(true);
    expect(shareMock).toHaveBeenCalled();
  });

  it('returns false when share throws', async () => {
    shareMock.mockRejectedValue(new Error('cancel'));
    const { nativeShare } = await import('@/lib/capacitor/nativeShare');
    const ok = await nativeShare({ title: 't', url: 'https://x.test' });
    expect(ok).toBe(false);
  });
});
