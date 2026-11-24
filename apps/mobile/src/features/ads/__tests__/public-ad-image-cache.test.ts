import { describe, expect, it } from 'vitest';
import {
  applyCachedPublicAdImages,
  getPublicAdImageCacheCandidates,
  schedulePublicAdImageCaching,
} from '../public-ad-image-cache';

describe('public ad image cache plan', () => {
  it('deduplicates URLs across cards and plans Cloudinary thumbnails', () => {
    const original = 'https://res.cloudinary.com/demo/image/upload/v1700000000/ads/a.webp';
    const other = 'https://cdn.example.com/ads/b.jpg';
    const candidates = getPublicAdImageCacheCandidates([
      { images: [original, other] },
      { images: [original] },
    ]);

    expect(candidates).toEqual([
      {
        remoteUri: original,
        cacheUri: 'https://res.cloudinary.com/demo/image/upload/c_limit,w_480,q_auto/v1700000000/ads/a.webp',
      },
      { remoteUri: other, cacheUri: other },
    ]);
  });

  it('keeps the page bounded to eight distinct remote images', () => {
    const items = [{ images: Array.from({ length: 12 }, (_, index) => `https://cdn.example.com/${index}.jpg`) }];
    expect(getPublicAdImageCacheCandidates(items)).toHaveLength(8);
    expect(getPublicAdImageCacheCandidates(items, 3)).toHaveLength(3);
  });

  it('uses only local files and leaves failed downloads on their remote URL', () => {
    const original = 'https://cdn.example.com/ad.jpg';
    const unchanged = 'https://cdn.example.com/other.jpg';
    const candidates = getPublicAdImageCacheCandidates([{ images: [original, unchanged] }]);
    const items = [{ id: 'ad-1', images: [original, unchanged] }];

    const patched = applyCachedPublicAdImages(items, candidates, [
      'file:///app/marketplat-public-images/ad.jpg',
      unchanged,
    ]);

    expect(patched[0].images).toEqual(['file:///app/marketplat-public-images/ad.jpg', unchanged]);
  });

  it('returns the original items when no image was cached locally', () => {
    const original = 'https://cdn.example.com/ad.jpg';
    const items = [{ images: [original] }];
    const candidates = getPublicAdImageCacheCandidates(items);

    expect(applyCachedPublicAdImages(items, candidates, [original])).toBe(items);
  });
});


describe('public ad image cache scheduling', () => {
  it('does not wait for the background image operation', async () => {
    let releaseTask!: () => void;
    let started = false;
    const pending = new Promise<void>((resolve) => { releaseTask = resolve; });

    schedulePublicAdImageCaching(() => {
      started = true;
      return pending;
    });

    expect(started).toBe(false);
    await Promise.resolve();
    expect(started).toBe(true);
    releaseTask();
  });
});
