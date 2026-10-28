import { apiClient } from './client';
import { getNetworkPolicy } from '@/lib/networkPolicy';
import type { ApiResponse } from '@/types/api.types';
import { recordRequestRetry, recordUploadAttempt, recordUploadResult } from '@/lib/networkObservability';
import { isNetworkFailure } from '@/lib/networkErrors';

export type UploadedImage = { url: string; publicId: string };

/**
 * Adaptive multipart upload policy: concurrency, timeout, and retry spacing
 * follow the central NetworkPolicy instead of using one fixed budget.
 *
 * On weak networks (the app's target audience — Gaza mobile), the
 * first multipart POST to Render + Cloudinary often fails for reasons
 * that have nothing to do with the file itself: Render's free tier
 * worker was asleep and is still cold-starting, the Cloudinary edge
 * the request landed on was slow on TLS handshake, or the request
 * was simply the first one after the device's radio came out of a
 * low-power state. The user-visible signature of all three is
 * identical: "first upload fails, second works" — which is exactly
 * what this module's absence of any retry produced. Retrying a couple
 * of times with small backoff converts most of these into transparent
 * successes instead of forcing the user to tap submit twice.
 *
 * Retries ONLY on network-shaped failures (no HTTP response). A real 4xx
 * is a server-validated permanent problem and is never retried here.
 */
const DEFAULT_UPLOAD_TIMEOUT_MS = 30_000;



function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let activeUploads = 0;
const uploadWaiters: Array<() => void> = [];

async function acquireUploadSlot(limit: number): Promise<void> {
  if (limit <= 0) throw new Error('UPLOAD_NETWORK_NOT_ALLOWED');
  if (activeUploads < limit) {
    activeUploads += 1;
    return;
  }
  await new Promise<void>((resolve) => uploadWaiters.push(resolve));
  activeUploads += 1;
}

function releaseUploadSlot(): void {
  activeUploads = Math.max(0, activeUploads - 1);
  const next = uploadWaiters.shift();
  if (next) next();
}

export const mediaApi = {
  uploadImages: async (files: File[]) => {
    const policy = getNetworkPolicy();
    const retryDelays = policy.uploadRetryDelaysMs;
    const timeout = policy.uploadTimeoutMs || DEFAULT_UPLOAD_TIMEOUT_MS;
    await acquireUploadSlot(policy.uploadConcurrency);

    let lastErr: unknown = null;
    try {
      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        // Fresh FormData each attempt: a streamed FormData instance must not
        // be reused after a failed multipart request.
        const form = new FormData();
        for (const f of files) form.append('images', f);

        try {
          recordUploadAttempt();
          const response = await apiClient.post<ApiResponse<UploadedImage[]>>(
            '/media/images',
            form,
            // Let the browser add the multipart boundary.
            { timeout },
          );
          recordUploadResult(true);
          return response;
        } catch (err) {
          lastErr = err;
          recordUploadResult(false);
          if (!isNetworkFailure(err)) throw err;
          if (typeof navigator !== 'undefined' && navigator.onLine === false) throw err;

          const delayMs = retryDelays[attempt];
          if (delayMs == null) break;
          recordRequestRetry();
          await sleep(delayMs);
        }
      }
    } finally {
      releaseUploadSlot();
    }

    throw lastErr;
  },
};
