import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Share } from 'react-native';
import { createMarketPlatDeepLink, shareMarketPlatResource, shareSharedPayload, type ShareableResource } from '../deep-links';

const shareMock = vi.mocked(Share.share);

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  shareMock.mockClear();
  vi.stubEnv('EXPO_PUBLIC_WEB_URL', 'https://mobile-test.example/');
});

describe('createMarketPlatDeepLink', () => {
  it('creates HTTPS links and safely encodes resource identifiers', () => {
    expect(createMarketPlatDeepLink('ads', 'item/with space')).toBe('https://mobile-test.example/ads/item%2Fwith%20space');
  });

  it('drops unsafe query parameter names and omits empty values', () => {
    const url = createMarketPlatDeepLink('products', 'p1', {
      category: 'cars', 'bad key': 'ignored', empty: '', ['x'.repeat(81)]: 'ignored',
    });
    expect(url).toBe('https://mobile-test.example/products/p1?category=cars');
  });

  it('shares stories through the public author profile and keeps the story id as a hint', () => {
    const url = createMarketPlatDeepLink('stories', 'story-1', { userId: 'author-1' });
    expect(url).toContain('/profile/author-1?');
    expect(url).toContain('storyId=story-1');
  });

  it('rejects missing, oversized and unsupported resource identifiers', () => {
    expect(() => createMarketPlatDeepLink('ads', '  ')).toThrow('بيانات الرابط غير صالحة.');
    expect(() => createMarketPlatDeepLink('ads', 'x'.repeat(201))).toThrow('بيانات الرابط غير صالحة.');
    expect(() => createMarketPlatDeepLink('unknown' as ShareableResource, 'id')).toThrow('بيانات الرابط غير صالحة.');
  });

  it('requires a valid author id when creating a story link', () => {
    expect(() => createMarketPlatDeepLink('stories', 'story-1')).toThrow('رابط المشاركة يفتقد معرّفًا صالحًا.');
  });

  it('filters extra keys but URL-encodes allowed query values', () => {
    const url = createMarketPlatDeepLink('stores', 'store-1', { campaign: 'summer sale' });
    expect(url).toContain('campaign=summer+sale');
  });
});

describe('share helpers', () => {
  it('shares the generated public resource link with a trimmed title', async () => {
    await shareMarketPlatResource('ads', 'ad-1', '  Ad title  ');
    expect(shareMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'مشاركة على MarketPlat',
      message: expect.stringContaining('Ad title\nhttps://mobile-test.example/ads/ad-1'),
      url: 'https://mobile-test.example/ads/ad-1',
    }));
  });

  it('uses a fallback title when the supplied title is blank', async () => {
    await shareMarketPlatResource('ads', 'ad-1', '  ');
    expect(shareMock.mock.calls[0]?.[0].message).toContain('شاهد هذا المحتوى على MarketPlat');
  });

  it('rejects malformed or oversized shared payloads before opening native share', async () => {
    await expect(shareSharedPayload('', 'title')).rejects.toThrow('بيانات المشاركة غير صالحة.');
    await expect(shareSharedPayload('bad/payload', 'title')).rejects.toThrow('بيانات المشاركة غير صالحة.');
    await expect(shareSharedPayload('a'.repeat(12001), 'title')).rejects.toThrow('بيانات المشاركة غير صالحة.');
    expect(shareMock).not.toHaveBeenCalled();
  });

  it('shares valid compact payloads as client-side fragments', async () => {
    await shareSharedPayload('YWJjLTEyMw', '  Offline item  ');
    expect(shareMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'مشاركة بدون إنترنت',
      url: 'https://mobile-test.example/shared#d=YWJjLTEyMw',
      message: expect.stringContaining('Offline item'),
    }));
  });
});
