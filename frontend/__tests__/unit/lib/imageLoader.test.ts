import { describe, expect, it } from 'vitest';
import imageLoader from '@/lib/imageLoader';

describe('custom image loader', () => {
  it('adds a bounded transformation after existing transforms in versioned Cloudinary URLs', () => {
    const result = new URL(imageLoader({
      src: 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/c_fill,w_800/v123456/photo.jpg',
      width: 320,
    }));

    expect(result.hostname).toBe('res.cloudinary.com');
    expect(result.pathname).toBe('/demo/image/upload/f_auto,q_auto/c_fill,w_800/c_limit,w_320/v123456/photo.jpg');
  });

  it('supports plain unversioned Cloudinary public IDs without falling back to /_next/image', () => {
    const result = new URL(imageLoader({
      src: 'https://res.cloudinary.com/demo/image/upload/photo.jpg',
      width: 240,
    }));

    expect(result.pathname).toBe('/demo/image/upload/c_limit,w_240,f_auto,q_auto/photo.jpg');
  });

  it('supports unversioned URLs that already contain Cloudinary transformations', () => {
    const result = new URL(imageLoader({
      src: 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/users/avatar.jpg?version=2',
      width: 96,
    }));

    expect(result.pathname).toBe('/demo/image/upload/f_auto,q_auto/c_limit,w_96/users/avatar.jpg');
    expect(result.searchParams.get('version')).toBe('2');
  });

  it('does not rewrite Cloudinary SVGs', () => {
    const src = 'https://res.cloudinary.com/demo/image/upload/logo.svg';
    expect(imageLoader({ src, width: 128 })).toBe(src);
  });

  it('keeps non-Cloudinary sources on Next image optimization', () => {
    const src = 'https://images.example.com/photo.jpg';
    expect(imageLoader({ src, width: 640, quality: 80 })).toBe(
      `/_next/image?url=${encodeURIComponent(src)}&w=640&q=80`,
    );
  });
});
