import { describe, expect, it, vi } from 'vitest';
import { normalizePickedImage } from '../normalize-image-asset';

describe('normalizePickedImage', () => {
  it.each([
    ['photo.JPG', 'image/jpeg', 'photo.jpg'],
    ['photo.png', 'image/png', 'photo.png'],
    ['photo.webp', 'image/webp', 'photo.webp'],
    ['photo.jpg', 'image/jpg', 'photo.jpg'],
  ])('normalizes supported image %s', (fileName, mimeType, expectedName) => {
    expect(normalizePickedImage({ uri: 'file:///cache/photo', fileName, mimeType })).toEqual({
      uri: 'file:///cache/photo', fileName: expectedName, mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
    });
  });

  it('infers MIME type from URI when picker metadata is missing', () => {
    expect(normalizePickedImage({ uri: 'content://media/123/photo.webp?token=1' })).toMatchObject({
      uri: 'content://media/123/photo.webp?token=1', mimeType: 'image/webp', fileName: expect.stringMatching(/\.webp$/),
    });
  });

  it('uses a safe fallback name and defaults unknown extensionless files to JPEG', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(normalizePickedImage({ uri: 'file:///cache/unnamed' }, 'upload')).toEqual({
      uri: 'file:///cache/unnamed', fileName: expect.stringMatching(/^upload-123-/), mimeType: 'image/jpeg',
    });
    vi.restoreAllMocks();
  });

  it.each([
    { uri: '', fileName: 'photo.jpg' },
    { uri: 'file:///cache/photo.gif', fileName: 'photo.gif' },
    { uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/gif' },
    { uri: 'file:///cache/photo.png', fileName: 'photo.png', mimeType: 'image/jpeg' },
    { uri: 'file:///cache/photo.exe', fileName: 'photo.exe' },
  ])('rejects invalid, unsupported, or mismatched image metadata', (asset) => {
    expect(() => normalizePickedImage(asset)).toThrow();
  });

  it('strips directory traversal from the supplied file name', () => {
    expect(normalizePickedImage({ uri: 'file:///cache/photo.jpg', fileName: '../../my photo.jpg' }).fileName).toBe('my-photo.jpg');
  });
});
