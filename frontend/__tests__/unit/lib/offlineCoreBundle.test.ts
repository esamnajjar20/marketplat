/**
 * __tests__/unit/lib/offlineCoreBundle.test.ts
 */
import { describe, it, expect } from 'vitest';
import { getListThumbnailUrl, getAvatarUrl } from '@/lib/cloudinary';
import {
  CORE_CACHE,
  THUMB_CAPS,
  CORE_TTL_BY_TIER_MS,
  collectThumbnailUrls,
  buildCoreUrls,
  getWarmupProgress,
  onWarmupProgress,
} from '@/lib/offlineCoreBundle';

vi.mock('@/lib/constants', () => ({
  API_BASE_URL: 'https://api.example.com',
}));

describe('offlineCoreBundle', () => {
  it('exports CORE_CACHE versioned name', () => {
    expect(CORE_CACHE).toMatch(/^market-core-v/);
  });

  it('buildCoreUrls returns API list endpoints', () => {
    const urls = buildCoreUrls();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.key && u.url)).toBe(true);
    // Should include core browsing endpoints
    const joined = urls.map((u) => u.url).join(' ');
    expect(joined).toMatch(/categories|products|stores/i);
  });

  // FEAT-CREATE-BROADCAST-01: service-categories must be warmed too — it's
  // the one taxonomy endpoint two creation forms (ServiceListingForm,
  // CreateServiceBroadcastForm) rely on that this list previously omitted.
  it('buildCoreUrls includes service-categories (used by service-listing and service-broadcast forms offline)', () => {
    const urls = buildCoreUrls();
    const entry = urls.find((u) => u.key === 'service-categories');
    expect(entry).toBeTruthy();
    expect(entry!.url).toBe('https://api.example.com/service-categories');
  });

  // CORE-TAXONOMY-01: URLs must match the apiClient calls literally (Cache API
  // match() compares the full URL) — no params, no trailing slash.
  it.each([
    ['product-categories', 'https://api.example.com/product-categories'],
    ['store-types', 'https://api.example.com/store-types'],
    ['service-types', 'https://api.example.com/service-types'],
  ])('buildCoreUrls includes %s with the exact unparameterised URL', (key, url) => {
    const entry = buildCoreUrls().find((u) => u.key === key);
    expect(entry).toBeTruthy();
    expect(entry!.url).toBe(url);
  });

  it('buildCoreUrls has unique keys and unique URLs', () => {
    const urls = buildCoreUrls();
    expect(new Set(urls.map((u) => u.key)).size).toBe(urls.length);
    expect(new Set(urls.map((u) => u.url)).size).toBe(urls.length);
  });

  it('getWarmupProgress returns a progress object', () => {
    const p = getWarmupProgress();
    expect(p).toBeTruthy();
    expect(typeof p).toBe('object');
  });

  it('onWarmupProgress registers and unregisters listener', () => {
    const listener = vi.fn();
    const off = onWarmupProgress(listener);
    expect(typeof off).toBe('function');
    off();
  });

  // FIX WARM-THUMBS-01
  describe('collectThumbnailUrls', () => {
    const cl = (n: number) => `https://res.cloudinary.com/demo/image/upload/v1/ad_${n}.jpg`;
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ images: [cl(i)] }));

    it('warms the EXACT url the cards render (getListThumbnailUrl 320x224), not the raw image', () => {
      const out = collectThumbnailUrls({ ads: { data: [{ images: [cl(1)] }] } });
      expect(out).toEqual([getListThumbnailUrl(cl(1), 320, 224)]);
      expect(out).not.toContain(cl(1));
    });

    it('caps each list separately so ads/services/stores are not starved by products', () => {
      const out = collectThumbnailUrls({
        ads: { data: items(30) },
        products: { data: items(30).map((x, i) => ({ images: [cl(100 + i)] })) },
        services: { data: items(30).map((x, i) => ({ images: [cl(200 + i)] })) },
        stores: { data: Array.from({ length: 10 }, (_, i) => ({ logoUrl: cl(300 + i) })) },
      });
      const total = THUMB_CAPS.ads + THUMB_CAPS.products + THUMB_CAPS.services + THUMB_CAPS.stores;
      expect(out).toHaveLength(total);
      expect(out).toContain(getListThumbnailUrl(cl(0), 320, 224)); // ads present
      expect(out).toContain(getAvatarUrl(cl(300), 96)); // store logos present
    });

    it('ignores malformed items and non-array data', () => {
      expect(
        collectThumbnailUrls({
          ads: { data: [null, {}, { images: [] }, { images: [42] }] },
          products: { data: 'nope' },
        }),
      ).toEqual([]);
    });
  });

  // FIX WARM-CORE-TTL-01
  it('core freshness window shrinks on better networks', () => {
    expect(CORE_TTL_BY_TIER_MS.full).toBeLessThan(CORE_TTL_BY_TIER_MS.core);
    expect(CORE_TTL_BY_TIER_MS.core).toBeLessThan(CORE_TTL_BY_TIER_MS.critical);
  });
});
