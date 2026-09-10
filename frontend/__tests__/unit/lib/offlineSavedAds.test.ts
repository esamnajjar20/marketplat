/**
 * __tests__/unit/lib/offlineSavedAds.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listSavedOfflineAds,
  isAdSavedOffline,
  unsaveAdOffline,
  SAVED_ADS_CACHE,
} from '@/lib/offlineSavedAds';
import { localGet, localSet } from '@/lib/localStore';

vi.mock('@/lib/localStore', () => ({
  localGet: vi.fn(() => []),
  localSet: vi.fn(),
}));

vi.mock('@/lib/cloudinary', () => ({
  getDetailImageUrl: (u: string) => u,
  getThumbnailUrl: (u: string) => u,
}));

vi.mock('@/lib/constants', () => ({
  API_BASE_URL: 'https://api.example.com',
}));

describe('offlineSavedAds', () => {
  beforeEach(() => {
    vi.mocked(localGet).mockReturnValue([]);
    vi.mocked(localSet).mockReset();
  });

  it('exports cache name constant', () => {
    expect(SAVED_ADS_CACHE).toBe('market-saved-ads');
  });

  it('lists empty initially', () => {
    expect(listSavedOfflineAds()).toEqual([]);
  });

  it('isAdSavedOffline checks index', () => {
    vi.mocked(localGet).mockReturnValue([
      { id: 'ad-1', title: 'x', price: null, city: 'غزة', thumbnail: null, savedAt: '2026-01-01' },
    ]);
    expect(isAdSavedOffline('ad-1')).toBe(true);
    expect(isAdSavedOffline('ad-2')).toBe(false);
  });

  it('unsaveAdOffline removes from index', async () => {
    vi.mocked(localGet).mockReturnValue([
      { id: 'ad-1', title: 'x', price: null, city: 'غزة', thumbnail: null, savedAt: '2026-01-01' },
      { id: 'ad-2', title: 'y', price: null, city: 'غزة', thumbnail: null, savedAt: '2026-01-01' },
    ]);
    // caches may not exist in jsdom
    const open = vi.fn(async () => ({
      delete: vi.fn(async () => true),
    }));
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open },
    });

    await unsaveAdOffline('ad-1');
    expect(localSet).toHaveBeenCalled();
    const saved = vi.mocked(localSet).mock.calls[0][1] as { id: string }[];
    expect(saved.every((a) => a.id !== 'ad-1')).toBe(true);
  });
});
