jest.mock('../../src/config/env', () => ({
  env: { cloudinary: { cloudName: 'demo' } },
}));

jest.mock('../../src/config/cloudinary', () => ({
  deleteImage: jest.fn().mockResolvedValue(undefined),
}));

import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../src/shared/utils/cloudinaryHelpers';
import { deleteImage } from '../../src/config/cloudinary';

describe('extractCloudinaryPublicId', () => {
  it('extracts the public ID from a standard Cloudinary URL', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1234567890/classifieds/ads/abc123.webp';
    expect(extractCloudinaryPublicId(url)).toBe('classifieds/ads/abc123');
  });

  it('extracts the public ID without a version segment', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/classifieds/avatars/xyz.webp';
    expect(extractCloudinaryPublicId(url)).toBe('classifieds/avatars/xyz');
  });

  it('extracts a nested-folder public ID correctly', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v999/a/b/c/d.png';
    expect(extractCloudinaryPublicId(url)).toBe('a/b/c/d');
  });

  it('strips the file extension', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpeg';
    expect(extractCloudinaryPublicId(url)).toBe('photo');
  });

  it('returns null for a non-Cloudinary URL', () => {
    expect(extractCloudinaryPublicId('https://example.com/image.jpg')).toBeNull();
  });

  it('returns null for a Cloudinary URL belonging to a different cloud name', () => {
    const url = 'https://res.cloudinary.com/someone-elses-cloud/image/upload/v1/photo.jpg';
    expect(extractCloudinaryPublicId(url)).toBeNull();
  });

  it('returns null for a malformed URL string', () => {
    expect(extractCloudinaryPublicId('not a url')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractCloudinaryPublicId('')).toBeNull();
  });

  it('returns null when there is no /upload/ segment', () => {
    const url = 'https://res.cloudinary.com/demo/image/fetch/v1/photo.jpg';
    expect(extractCloudinaryPublicId(url)).toBeNull();
  });

  it('handles a URL with multiple version-like segments correctly (only true version is stripped)', () => {
    // "v2" as a literal folder name vs. a real version segment is ambiguous in
    // Cloudinary URLs by design (Cloudinary itself uses /v<digits>/ as the
    // version marker) — verify our regex only strips a pure v<digits> token.
    const url = 'https://res.cloudinary.com/demo/image/upload/v1700000000/folder/v2-final.png';
    expect(extractCloudinaryPublicId(url)).toBe('folder/v2-final');
  });
});

describe('cleanupUploadedImages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls deleteImage for every public ID provided', async () => {
    await cleanupUploadedImages(['id-1', 'id-2', 'id-3']);
    expect(deleteImage).toHaveBeenCalledTimes(3);
    expect(deleteImage).toHaveBeenCalledWith('id-1');
    expect(deleteImage).toHaveBeenCalledWith('id-2');
    expect(deleteImage).toHaveBeenCalledWith('id-3');
  });

  it('does nothing for an empty array', async () => {
    await cleanupUploadedImages([]);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('does not throw when one deleteImage call rejects (best-effort cleanup)', async () => {
    (deleteImage as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Cloudinary API down'))
      .mockResolvedValueOnce(undefined);

    await expect(cleanupUploadedImages(['ok-1', 'fails', 'ok-2'])).resolves.toBeUndefined();
  });

  it('attempts all deletions even if the first one fails (does not short-circuit)', async () => {
    (deleteImage as jest.Mock)
      .mockRejectedValueOnce(new Error('fails first'))
      .mockResolvedValueOnce(undefined);

    await cleanupUploadedImages(['fails', 'should-still-be-called']);
    expect(deleteImage).toHaveBeenCalledTimes(2);
  });
});
