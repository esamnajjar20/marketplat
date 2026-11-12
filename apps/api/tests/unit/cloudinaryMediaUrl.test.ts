import { parseTrustedCloudinaryMediaUrl } from '../../src/shared/media/cloudinaryMediaUrl';

describe('parseTrustedCloudinaryMediaUrl', () => {
  const cloudName = 'marketplat';

  it('accepts canonical HTTPS Cloudinary delivery URLs for this cloud', () => {
    const url = parseTrustedCloudinaryMediaUrl(
      'https://res.cloudinary.com/marketplat/image/upload/v1740000000/chat/photo.webp',
      cloudName,
    );

    expect(url?.hostname).toBe('res.cloudinary.com');
    expect(url?.pathname).toContain('/marketplat/image/upload/');
  });

  it.each([
    'http://res.cloudinary.com/marketplat/image/upload/photo.webp',
    'https://res.cloudinary.com.attacker.example/marketplat/image/upload/photo.webp',
    'https://sub.res.cloudinary.com/marketplat/image/upload/photo.webp',
    'https://res.cloudinary.com:8443/marketplat/image/upload/photo.webp',
    'https://user@res.cloudinary.com/marketplat/image/upload/photo.webp',
    'https://res.cloudinary.com/another-cloud/image/upload/photo.webp',
    'https://res.cloudinary.com/marketplat/image/fetch/https://example.com/a.jpg',
    'https://res.cloudinary.com/marketplat/image/upload/photo.webp?redirect=https://127.0.0.1',
    'https://res.cloudinary.com/marketplat/image/upload/photo.webp#fragment',
    'https://res.cloudinary.com/marketplat/image/upload',
  ])('rejects unsafe or non-canonical URL: %s', (candidate) => {
    expect(parseTrustedCloudinaryMediaUrl(candidate, cloudName)).toBeNull();
  });

  it('rejects an invalid configured cloud name', () => {
    expect(parseTrustedCloudinaryMediaUrl(
      'https://res.cloudinary.com/marketplat/image/upload/photo.webp',
      'marketplat/path',
    )).toBeNull();
  });
});
