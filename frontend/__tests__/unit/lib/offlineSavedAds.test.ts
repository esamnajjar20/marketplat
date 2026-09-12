/**
 * __tests__/unit/lib/offlineSavedAds.test.ts
 *
 * FIX SAVED-ADS-LEAK-01: saved-ad index entries now carry imageUrls so
 * eviction (cap) and manual removal can fully clean Cache Storage, not
 * just the localStorage index. Tests below cover both cleanup paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listSavedOfflineAds,
  isAdSavedOffline,
  unsaveAdOffline,
  saveAdOffline,
  SAVED_ADS_CACHE,
} from '@/lib/offlineSavedAds';
import { localGet, localSet } from '@/lib/localStore';
import type { Ad } from '@/types/ad.types';

vi.mock('@/lib/localStore', () => ({
  localGet: vi.fn(() => []),
  localSet: vi.fn(),
}));

vi.mock('@/lib/cloudinary', () => ({
  getDetailImageUrl: (u: string) => `detail:${u}`,
  getThumbnailUrl: (u: string) => `thumb:${u}`,
}));

vi.mock('@/lib/constants', () => ({
  API_BASE_URL: 'https://api.example.com',
}));

function makeAd(overrides: Partial<Ad> = {}): Ad {
  return {
    id: 'ad-1',
    title: 'إعلان تجريبي',
    price: '100',
    city: 'غزة',
    images: ['img-1.jpg'],
    ...overrides,
  } as Ad;
}

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
      { id: 'ad-1', title: 'x', price: null, city: 'غزة', thumbnail: null, savedAt: '2026-01-01', imageUrls: [] },
    ]);
    expect(isAdSavedOffline('ad-1')).toBe(true);
    expect(isAdSavedOffline('ad-2')).toBe(false);
  });

  it('unsaveAdOffline removes from index and deletes the API response + every stored image', async () => {
    vi.mocked(localGet).mockReturnValue([
      {
        id: 'ad-1', title: 'x', price: null, city: 'غزة', thumbnail: null, savedAt: '2026-01-01',
        imageUrls: ['detail:img-1.jpg', 'thumb:img-1.jpg'],
      },
      { id: 'ad-2', title: 'y', price: null, city: 'غزة', thumbnail: null, savedAt: '2026-01-01', imageUrls: [] },
    ]);
    const deletedUrls: string[] = [];
    const open = vi.fn(async () => ({
      delete: vi.fn(async (url: string) => {
        deletedUrls.push(url);
        return true;
      }),
    }));
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open },
    });

    await unsaveAdOffline('ad-1');

    expect(deletedUrls).toEqual(
      expect.arrayContaining(['https://api.example.com/ads/ad-1', 'detail:img-1.jpg', 'thumb:img-1.jpg']),
    );
    expect(localSet).toHaveBeenCalled();
    const saved = vi.mocked(localSet).mock.calls[0][1] as { id: string }[];
    expect(saved.every((a) => a.id !== 'ad-1')).toBe(true);
  });

  it('unsaveAdOffline tolerates a missing cache (jsdom) without throwing', async () => {
    vi.mocked(localGet).mockReturnValue([
      { id: 'ad-1', title: 'x', price: null, city: 'غزة', thumbnail: null, savedAt: '2026-01-01', imageUrls: [] },
    ]);
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: undefined });

    await expect(unsaveAdOffline('ad-1')).resolves.toBeUndefined();
    expect(localSet).toHaveBeenCalled();
  });

  it('saveAdOffline evicts and purges the cache for ads beyond MAX_SAVED_ADS', async () => {
    // 30 عنصرًا موجودًا مسبقًا بالفهرس — أقدمها (آخر عنصر بالمصفوفة، لأن
    // unshift يضع الأحدث أولًا) سيُقصى عند إضافة عنصر 31.
    const existing = Array.from({ length: 30 }, (_, i) => ({
      id: `old-${i}`,
      title: `t${i}`,
      price: null,
      city: 'غزة',
      thumbnail: null,
      savedAt: '2026-01-01',
      imageUrls: [`detail:old-${i}.jpg`],
    }));
    vi.mocked(localGet).mockReturnValue(existing);

    const deletedUrls: string[] = [];
    const open = vi.fn(async () => ({
      put: vi.fn(async () => undefined),
      delete: vi.fn(async (url: string) => {
        deletedUrls.push(url);
        return true;
      }),
    }));
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open } });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async () => new Response('{}', { status: 200 })),
    });

    const ok = await saveAdOffline(makeAd({ id: 'ad-new' }));

    expect(ok).toBe(true);
    // العنصر الأقدم (old-29، آخر عنصر بالمصفوفة الأصلية) هو من يُقصى.
    expect(deletedUrls).toEqual(
      expect.arrayContaining(['https://api.example.com/ads/old-29', 'detail:old-29.jpg']),
    );
    const savedIndex = vi.mocked(localSet).mock.calls[0][1] as { id: string }[];
    expect(savedIndex).toHaveLength(30);
    expect(savedIndex.find((a) => a.id === 'old-29')).toBeUndefined();
    expect(savedIndex.find((a) => a.id === 'ad-new')).toBeDefined();
  });
});
