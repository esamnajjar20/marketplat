import { describe, expect, it } from 'vitest';
import { LIST_THUMBNAIL_WIDTH, listThumbnailUri } from '../image-variants';

describe('listThumbnailUri', () => {
  const original = 'https://res.cloudinary.com/demo/image/upload/v1700000000/marketplat/ads/abc123.webp';

  it('inserts a limited-width transformation after /image/upload/', () => {
    expect(listThumbnailUri(original)).toBe(
      `https://res.cloudinary.com/demo/image/upload/c_limit,w_${LIST_THUMBNAIL_WIDTH},q_auto/v1700000000/marketplat/ads/abc123.webp`,
    );
  });

  it('honours a custom width', () => {
    expect(listThumbnailUri(original, 200)).toContain('/c_limit,w_200,q_auto/v1700000000/');
  });

  it('does not touch non-Cloudinary, local or already transformed URLs', () => {
    const urls = [
      'https://api.example.com/uploads/a.jpg',
      'file:///data/user/0/app/cache/a.jpg',
      'content://media/external/images/1',
      'https://res.cloudinary.com/demo/image/upload/w_100,c_fill/v1700000000/a.webp',
      'https://res.cloudinary.com/demo/video/upload/v1700000000/a.mp4',
      'http://res.cloudinary.com/demo/image/upload/v1700000000/a.webp',
    ];
    for (const url of urls) expect(listThumbnailUri(url)).toBe(url);
  });

  it('ignores invalid widths', () => {
    expect(listThumbnailUri(original, 0)).toBe(original);
    expect(listThumbnailUri(original, Number.NaN)).toBe(original);
  });
});
