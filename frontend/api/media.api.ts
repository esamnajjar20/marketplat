import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';

export type UploadedImage = { url: string; publicId: string };

/**
 * FIX MEDIA-UPLOAD-RETRY: 3-attempt retry for image uploads.
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
 * Retries ONLY on network-shaped failures (statusCode 0 = no HTTP
 * response). A real 4xx (image too large, wrong MIME) is a
 * permanent problem the server answered about — retrying can never
 * fix it and only delays the error message the user needs to see.
 */
const UPLOAD_TIMEOUT_MS = 30_000; // longer than the client-wide 15s — multipart is heavier than JSON
const UPLOAD_RETRY_DELAYS_MS = [1500, 4000];

function isNetworkFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { statusCode?: number; code?: string };
  return (
    e.statusCode === 0 ||
    e.code === 'NETWORK_ERROR' ||
    e.code === 'ECONNABORTED'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const mediaApi = {
  uploadImages: async (files: File[]) => {
    let lastErr: unknown = null;

    for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS_MS.length; attempt++) {
      // Fresh FormData each attempt — reusing the same instance can
      // silently send an empty body once the first attempt has
      // streamed it out to the network layer.
      const form = new FormData();
      for (const f of files) form.append('images', f);

      try {
        return await apiClient.post<ApiResponse<UploadedImage[]>>(
          '/media/images',
          form,
          // FIX MULTIPART-BOUNDARY-01: no manual Content-Type — see
          // api/users.api.ts's comment. Retry loop stays.
          { timeout: UPLOAD_TIMEOUT_MS },
        );
      } catch (err) {
        lastErr = err;
        if (!isNetworkFailure(err)) throw err;
        // FIX OFFLINE-FAST-FAIL (media side): don't waste the
        // 1.5s + 4s backoff retrying while the device has already
        // told us it's offline — every retry would fail instantly
        // with the same fast-fail error, and the caller (image
        // upload in a form's mutation) is better served by an
        // immediate "محفوظ محليًا" toast than a 5.5s pause.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          throw err;
        }
        if (attempt < UPLOAD_RETRY_DELAYS_MS.length) {
          const delayMs = UPLOAD_RETRY_DELAYS_MS[attempt] ?? 0;
          console.warn(
            `[mediaApi] upload attempt ${attempt + 1} failed (network), retrying in ${delayMs}ms`,
          );
          await sleep(delayMs);
        }
      }
    }

    throw lastErr;
  },
};
