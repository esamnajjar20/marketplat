jest.mock('../../src/config/env', () => ({
  env: {
    rateLimit: { disabled: true }, cloudinary: { cloudName: 'demo' } },
}));

jest.mock('../../src/config/cloudinary', () => ({
  deleteMedia: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/config/prisma', () => ({
  prisma: { $executeRaw: jest.fn().mockResolvedValue(1) },
}));
jest.mock('../../src/shared/jobs/backgroundTask', () => ({
  reportBackgroundFailure: jest.fn(),
}));

import {
  extractCloudinaryPublicId,
  cleanupUploadedImages,
  deleteCloudinaryAsset,
  queueCloudinaryAssetCleanup,
} from '../../src/shared/media/cloudinaryHelpers';
import { deleteMedia } from '../../src/config/cloudinary';
import { prisma } from '../../src/config/prisma';

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

  it('ignores delivery transformations before the Cloudinary version marker', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/c_limit,w_1200,h_800/q_auto:good/f_webp/v1700000000/classifieds/ads/photo.webp';
    expect(extractCloudinaryPublicId(url)).toBe('classifieds/ads/photo');
  });

  it('preserves raw extensions after transformation and version segments', () => {
    const url = 'https://res.cloudinary.com/demo/raw/upload/fl_attachment/v1700000000/classifieds/chat-files/report.pdf';
    expect(extractCloudinaryPublicId(url, { preserveExtension: true })).toBe(
      'classifieds/chat-files/report.pdf'
    );
  });

  it('strips the file extension', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpeg';
    expect(extractCloudinaryPublicId(url)).toBe('photo');
  });

  it('returns null for a non-Cloudinary URL', () => {
    expect(extractCloudinaryPublicId('https://example.com/image.jpg')).toBeNull();
  });

  it('does not accept a hostname that merely ends with cloudinary.com', () => {
    expect(
      extractCloudinaryPublicId(
        'https://res.cloudinary.com.attacker.example/demo/image/upload/v1/photo.jpg'
      )
    ).toBeNull();
  });

  it('preserves the extension for raw-resource public IDs', () => {
    const url = 'https://res.cloudinary.com/demo/raw/upload/v1/classifieds/chat-files/report.pdf';
    expect(extractCloudinaryPublicId(url, { preserveExtension: true })).toBe(
      'classifieds/chat-files/report.pdf'
    );
    expect(extractCloudinaryPublicId(url)).toBe('classifieds/chat-files/report');
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

  it('calls deleteMedia for every public ID provided', async () => {
    await cleanupUploadedImages(['id-1', 'id-2', 'id-3']);
    expect(deleteMedia).toHaveBeenCalledTimes(3);
    expect(deleteMedia).toHaveBeenCalledWith('id-1', 'image');
    expect(deleteMedia).toHaveBeenCalledWith('id-2', 'image');
    expect(deleteMedia).toHaveBeenCalledWith('id-3', 'image');
  });

  it('does nothing for an empty array', async () => {
    await cleanupUploadedImages([]);
    expect(deleteMedia).not.toHaveBeenCalled();
  });

  it('does not throw when one deleteMedia call rejects (best-effort cleanup)', async () => {
    (deleteMedia as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Cloudinary API down'))
      .mockResolvedValueOnce(undefined);

    await expect(cleanupUploadedImages(['ok-1', 'fails', 'ok-2'])).resolves.toBeUndefined();
  });

  it('attempts all deletions even if the first one fails (does not short-circuit)', async () => {
    (deleteMedia as jest.Mock)
      .mockRejectedValueOnce(new Error('fails first'))
      .mockResolvedValueOnce(undefined);

    await cleanupUploadedImages(['fails', 'should-still-be-called']);
    expect(deleteMedia).toHaveBeenCalledTimes(2);
  });
});


describe('deleteCloudinaryAsset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists a retry job when an immediate Cloudinary deletion fails', async () => {
    (deleteMedia as jest.Mock).mockRejectedValueOnce(new Error('Cloudinary unavailable'));

    await expect(deleteCloudinaryAsset('classifieds/chat/file-1', 'raw')).resolves.toBeUndefined();

    expect(deleteMedia).toHaveBeenCalledWith('classifieds/chat/file-1', 'raw');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not call Cloudinary or enqueue blank or oversized IDs', async () => {
    await deleteCloudinaryAsset('   ');
    await deleteCloudinaryAsset('x'.repeat(513));
    expect(deleteMedia).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});


describe('queueCloudinaryAssetCleanup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes an explicitly referenced asset to the durable queue using the supplied transaction executor', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const executor = { $executeRaw: executeRaw } as any;

    await queueCloudinaryAssetCleanup('classifieds/chat-files/report.pdf', 'raw', executor);

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
