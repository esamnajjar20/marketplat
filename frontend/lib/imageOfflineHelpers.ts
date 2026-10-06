/**
 * Shared best-effort image helpers used by every offline-capable
 * create/edit flow (useAdMutations, useProductMutations,
 * useServiceListingMutations, useRequestMutations). Previously each
 * file declared its own private copy — see 
 * and in any of those files for the sequence
 * of that produced this shape. Extracted here (FIX
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
/**
 * OFFLINE-COMPRESS-TIMEOUT-01: hard cap on total compression time.
 *
 * Symptom this on Android WebView (PWA + Capacitor) with a slow
 * device, compressInWorker's 30s WORKER_TIMEOUT_MS plus the fallback
 * path's unbounded createImageBitmap await left the "publish" button
 * stuck on "جاري النشر..." indefinitely — the draft was never saved.
 * 5s is enough for a single 2-5 MB photo on the phones this targets;
 * anything slower falls through to the originals, which are still
 * uploadable (draft save is the priority — the user is offline).
 */
const COMPRESS_TOTAL_TIMEOUT_MS = 5_000;

export async function bestEffortCompressPublish(files: File[]): Promise<File[]> {
  const work = Promise.all(
    files.map(async (f) => {
      try {
        return await compressImageForPublish(f);
      } catch {
        return f;
      }
    }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<File[]>((resolve) => {
    timer = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn('[image-offline] compress timeout — using originals');
      resolve(files);
    }, COMPRESS_TOTAL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  // OFFLINE-COMPRESS-TIMEOUT-01-PREVIEW: same 5s hard cap as
  // bestEffortCompressPublish — otherwise a single stuck preview
  // compression blocks onError past the publish step and the button
  // stays on "جاري النشر..." (allSettled waits for the slowest, not
  // the fastest). A draft without previews is still publishable.
  const work = Promise.allSettled(
    files.slice(0, 4).map(async (f) => ({ name: f.name, blob: await compressImageForOffline(f) })),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PromiseSettledResult<{ name: string; blob: Blob }>[]>(
    (resolve) => {
      timer = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('[image-offline] preview compress timeout — skipping previews');
        resolve([]);
      }, COMPRESS_TOTAL_TIMEOUT_MS);
    },
  );
  let results: PromiseSettledResult<{ name: string; blob: Blob }>[];
  try {
    results = await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return results
    .filter((r): r is PromiseFulfilledResult<{ name: string; blob: Blob }> => r.status === 'fulfilled')
    .map((r) => r.value);
}
