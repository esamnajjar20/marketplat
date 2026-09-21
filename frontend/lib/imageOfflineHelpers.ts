/**
 * Shared best-effort image helpers used by every offline-capable
 * create/edit flow (useAdMutations, useProductMutations,
 * useServiceListingMutations, useRequestMutations). Previously each
 * file declared its own private copy — see FIX IMAGEOFFLINE-WIRE-01
 * and FIX TRIPLE-COMPRESS-01 in any of those files for the sequence
 * of fixes that produced this shape. Extracted here (FIX
 * IMAGEOFFLINE-EXTRACT) so the next improvement to retry behavior,
 * slice count, or the "what to do when canvas is unavailable"
 * policy only has to land in one place.
 */
import { compressImageForOffline, compressImageForPublish } from '@/lib/imageOffline';

/**
 * Best-effort compression for the multipart publish payload. One
 * image failing (not a real image, canvas unavailable on this
 * device) does not stop the rest and does not block the draft
 * itself — the failed one falls through to its original File, and
 * the real publish (which runs through the SW queue, not this path)
 * is unaffected.
 */
export async function bestEffortCompressPublish(files: File[]): Promise<File[]> {
  return Promise.all(
    files.map(async (f) => {
      try {
        return await compressImageForPublish(f);
      } catch {
        return f;
      }
    }),
  );
}

/**
 * Compress only the first four images for the draft preview — the
 * sync center never shows more than a few thumbnails, and running
 * this over a full 10-image selection is exactly the CPU cost FIX
 * TRIPLE-COMPRESS-01 was written to prevent. Promise.allSettled so
 * one failure doesn't drop the others.
 */
export async function bestEffortCompressPreviews(
  files: File[],
): Promise<{ name: string; blob: Blob }[]> {
  const results = await Promise.allSettled(
    files.slice(0, 4).map(async (f) => ({ name: f.name, blob: await compressImageForOffline(f) })),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{ name: string; blob: Blob }> => r.status === 'fulfilled')
    .map((r) => r.value);
}
