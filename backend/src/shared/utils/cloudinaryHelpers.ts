import { deleteImage } from '../../config/cloudinary';
import { env } from '../../config/env';

/**
 * Extracts the Cloudinary public ID from a secure_url, e.g.
 * "https://res.cloudinary.com/demo/image/upload/v123/classifieds/ads/abc.webp"
 * -> "classifieds/ads/abc"
 *
 * Returns null for any URL that isn't a Cloudinary URL for this app's cloud
 * (so we never attempt to delete an asset belonging to a different account).
 *
 * Moved here from ads.service.ts so it can be shared with the avatar upload
 * feature (users.service.ts) without duplicating the parsing logic.
 */
export function extractCloudinaryPublicId(imageUrl: string): string | null {
  try {
    const url = new URL(imageUrl);
    if (!url.hostname.endsWith('cloudinary.com')) return null;

    const pathParts = url.pathname.split('/').filter(Boolean);
    if (env.cloudinary.cloudName && pathParts[0] !== env.cloudinary.cloudName) return null;

    const uploadIndex = pathParts.findIndex((part) => part === 'upload');
    if (uploadIndex === -1) return null;

    const publicIdParts = pathParts
      .slice(uploadIndex + 1)
      .filter((part) => part && !/^v\d+$/.test(part));

    if (publicIdParts.length === 0) return null;
    return publicIdParts.join('/').replace(/\.[^/.]+$/, '');
  } catch {
    return null;
  }
}

/**
 * Best-effort cleanup of uploaded Cloudinary assets, e.g. after a DB write
 * fails partway through. Failures are swallowed — an orphaned Cloudinary
 * asset is a minor storage cost, not worth failing the whole request over.
 */
export async function cleanupUploadedImages(publicIds: string[]): Promise<void> {
  await Promise.all(publicIds.map((publicId) => deleteImage(publicId).catch(() => undefined)));
}
