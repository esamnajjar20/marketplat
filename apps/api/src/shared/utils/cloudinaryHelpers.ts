import { reportBackgroundFailure } from './backgroundTask';
import { deleteMedia } from '../../config/cloudinary';
import { prisma } from '../../config/prisma';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { logger } from './logger';
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
export function extractCloudinaryPublicId(
  imageUrl: string,
  options: { preserveExtension?: boolean } = {}
): string | null {
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== 'res.cloudinary.com') return null;

    const pathParts = url.pathname.split('/').filter(Boolean);
    if (env.cloudinary.cloudName && pathParts[0] !== env.cloudinary.cloudName) return null;

    const uploadIndex = pathParts.findIndex(part => part === 'upload');
    if (uploadIndex === -1) return null;

    const afterUpload = pathParts.slice(uploadIndex + 1);
    // Cloudinary delivery URLs can contain transformation components before
    // the version marker (for example c_limit,.../q_auto/f_webp/v123/...)
    // so only the path after the first version segment is the public ID.
    const versionIndex = afterUpload.findIndex(part => /^v\d+$/.test(part));
    const publicIdParts = versionIndex >= 0 ? afterUpload.slice(versionIndex + 1) : afterUpload;

    if (publicIdParts.length === 0) return null;
    const publicId = publicIdParts.join('/');
    return options.preserveExtension ? publicId : publicId.replace(/\.[^/.]+$/, '');
  } catch {
    return null;
  }
}

export type CloudinaryResourceType = 'image' | 'video' | 'raw';

type MediaCleanupQueueExecutor = Pick<Prisma.TransactionClient, '$executeRaw'>;

/** Persist an explicitly-owned asset deletion in the durable queue. Passing a
 * Prisma transaction client lets callers atomically queue media cleanup with
 * the database operation that makes the asset unreachable. */
export async function queueCloudinaryAssetCleanup(
  publicId: string,
  resourceType: CloudinaryResourceType = 'image',
  executor: MediaCleanupQueueExecutor = prisma
): Promise<void> {
  const normalizedPublicId = publicId.trim();
  if (!normalizedPublicId || normalizedPublicId.length > 512) return;

  await executor.$executeRaw`
    INSERT INTO "media_cleanup_jobs" (
      "id", "publicId", "resourceType", "status", "attempts",
      "nextAttemptAt", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}::uuid, ${normalizedPublicId}, ${resourceType}, 'PENDING', 0,
      NOW(), NOW(), NOW()
    )
    ON CONFLICT ("resourceType", "publicId") DO UPDATE SET
      "status" = 'PENDING',
      "attempts" = 0,
      "nextAttemptAt" = NOW(),
      "lockedAt" = NULL,
      "leaseToken" = NULL,
      "lastError" = NULL,
      "completedAt" = NULL,
      "updatedAt" = NOW()
    WHERE "media_cleanup_jobs"."status" IN ('COMPLETED', 'DEAD')
  `;
}

/**
 * Best-effort cleanup for an explicitly owned asset removed outside a larger
 * transaction (for example an old avatar after replacement). Delete inline
 * first; if Cloudinary is unavailable, persist a durable retry job rather than
 * leaving an untracked orphan. The queue never discovers assets by folder.
 * Cleanup failure is logged but does not fail the user-facing operation.
 */
export async function deleteCloudinaryAsset(
  publicId: string,
  resourceType: CloudinaryResourceType = 'image'
): Promise<void> {
  const normalizedPublicId = publicId.trim();
  if (!normalizedPublicId || normalizedPublicId.length > 512) return;

  try {
    await deleteMedia(normalizedPublicId, resourceType);
    return;
  } catch (deleteError) {
    try {
      await queueCloudinaryAssetCleanup(normalizedPublicId, resourceType);
      logger.warn('Cloudinary deletion deferred to durable media cleanup queue', {
        resourceType,
        publicId: normalizedPublicId,
        errorType: deleteError instanceof Error ? deleteError.name : 'unknown',
      });
    } catch (queueError) {
      // The user-facing operation must not fail because cleanup failed, but
      // report the missing durable retry so it is visible to operators.
      logger.error('Cloudinary deletion failed and could not be queued', {
        resourceType,
        publicId: normalizedPublicId,
        deleteError,
        queueError,
      });
      reportBackgroundFailure('apps/api/src/shared/utils/cloudinaryHelpers.ts', queueError);
    }
  }
}

export async function cleanupUploadedImages(publicIds: string[]): Promise<void> {
  await Promise.all(publicIds.map(publicId => deleteCloudinaryAsset(publicId, 'image')));
}
