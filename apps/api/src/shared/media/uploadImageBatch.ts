import { uploadImage, type UploadResult } from '../../config/cloudinary';
import { cleanupUploadedImages } from './cloudinaryHelpers';

/**
 * Keep Cloudinary fan-out bounded within each multipart request. The shared
 * media-upload semaphore limits the number of simultaneous requests across
 * API replicas; this second limit prevents each request from opening up to ten
 * upload streams at once.
 */
export const MAX_PARALLEL_IMAGE_UPLOADS_PER_REQUEST = 3;

export async function uploadImageBatch(
  files: readonly Express.Multer.File[],
  folder: string
): Promise<UploadResult[]> {
  if (files.length === 0) return [];

  const results: Array<PromiseSettledResult<UploadResult> | undefined> = new Array(files.length);
  let nextIndex = 0;
  let firstFailure: unknown;
  let hasFailed = false;
  const workerCount = Math.min(files.length, MAX_PARALLEL_IMAGE_UPLOADS_PER_REQUEST);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!hasFailed) {
        const index = nextIndex++;
        if (index >= files.length) return;

        try {
          results[index] = {
            status: 'fulfilled',
            value: await uploadImage(files[index].buffer, folder),
          };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
          // Do not start additional provider uploads after the first failure.
          // Already-running uploads are still awaited below so every successful
          // asset can be cleaned up before this request rejects.
          if (!hasFailed) {
            firstFailure = reason;
            hasFailed = true;
          }
          return;
        }
      }
    })
  );

  const completedResults = results.filter(
    (result): result is PromiseSettledResult<UploadResult> => result !== undefined
  );
  const uploads = completedResults
    .filter(
      (result): result is PromiseFulfilledResult<UploadResult> => result.status === 'fulfilled'
    )
    .map(result => result.value);

  if (hasFailed) {
    // Wait for every sibling upload before cleanup so no late success can become
    // an untracked Cloudinary asset after the request has already failed.
    await cleanupUploadedImages(uploads.map(upload => upload.publicId));
    throw firstFailure;
  }

  return uploads;
}
