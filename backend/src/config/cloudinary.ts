import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";
import { logger } from "../shared/utils/logger";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from "../shared/utils/circuitBreaker";
import { ServiceUnavailableError } from "../shared/errors/ServiceUnavailableError";

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * PROD-FIX-02: previously uploadImage/uploadAvatar/deleteImage had no
 * timeout at all — a slow or hung Cloudinary connection kept the
 * underlying HTTP request open indefinitely, tying up the Express
 * request handler (and, for createAd/addImages, the withAdImagesLock
 * distributed lock) for as long as Cloudinary took to respond. There
 * is no app-level request timeout anywhere in server.ts/app.ts, so
 * nothing else would have cut this off either.
 *
 * Two layers, since either one alone can fail to actually stop things:
 *   1. `timeout` passed to Cloudinary's own upload/destroy options —
 *      this asks the underlying HTTP client to abort the socket after
 *      this many ms, which is the real fix (frees the outbound
 *      connection, not just this Promise).
 *   2. withTimeout() wraps the returned Promise as a fallback in case
 *      a given SDK version/edge case ignores its own `timeout` option
 *      (e.g. hangs during DNS resolution before the timer inside the
 *      SDK's own request even starts) — this guarantees the Promise
 *      this module hands back to callers always settles within the
 *      bound, even if the underlying socket takes longer to actually
 *      close.
 *
 * 20s for uploads (larger — image processing + upload of up to 5MB
 * over a potentially slow connection is legitimately slower than a
 * trivial API call), 10s for delete (a small, fast API call with no
 * file body).
 */
const UPLOAD_TIMEOUT_MS = 20_000;
const DELETE_TIMEOUT_MS = 10_000;

class CloudinaryTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Cloudinary ${operation} timed out after ${timeoutMs}ms`);
    this.name = "CloudinaryTimeoutError";
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CloudinaryTimeoutError(operation, timeoutMs));
    }, timeoutMs);
    // Don't let this timer alone keep the process alive.
    timer.unref();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * PROD-FIX-12: two independent circuit breakers — one for uploads, one
 * for deletes. Kept separate deliberately: a Cloudinary account issue
 * that specifically breaks destroy() (e.g. a permissions problem
 * affecting deletion but not upload) shouldn't also block new ad
 * creation, and vice versa. Both trip after 5 consecutive failures
 * (not spurious — a single blip shouldn't open the circuit, but 5 in a
 * row is a real pattern, not noise) and stay OPEN for 30s before
 * allowing a trial call — short enough that a resolved transient
 * outage recovers quickly, long enough to actually stop hammering a
 * struggling upstream for a meaningful window.
 *
 * When OPEN, callers get CircuitBreakerOpenError immediately instead
 * of waiting out UPLOAD_TIMEOUT_MS/DELETE_TIMEOUT_MS on every single
 * request during a sustained outage — this is the actual point of a
 * circuit breaker on top of the per-call timeout already added in
 * PROD-FIX-02: bounding how many failing/hanging calls pile up
 * in-flight at once, not just how long any one of them can take.
 */
const uploadBreaker = new CircuitBreaker({
  name: "cloudinary-upload",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

const deleteBreaker = new CircuitBreaker({
  name: "cloudinary-delete",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

export const uploadImage = async (
  buffer: Buffer,
  folder: string,
): Promise<UploadResult> => {
  return uploadBreaker
    .execute(async () => {
      const uploadPromise = new Promise<UploadResult>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: `classifieds/${folder}`,
              timeout: UPLOAD_TIMEOUT_MS,
              transformation: [
                { width: 1200, height: 800, crop: "limit" },
                { quality: "auto:good" },
                { format: "webp" },
              ],
            },
            (error, result) => {
              if (error || !result)
                return reject(new Error("Image upload failed"));
              resolve({ url: result.secure_url, publicId: result.public_id });
            },
          )
          .end(buffer);
      });

      try {
        return await withTimeout(
          uploadPromise,
          UPLOAD_TIMEOUT_MS,
          "image upload",
        );
      } catch (err) {
        if (err instanceof CloudinaryTimeoutError) {
          logger.error("Cloudinary upload timed out", {
            folder,
            timeoutMs: UPLOAD_TIMEOUT_MS,
          });
        }
        throw err;
      }
    })
    .catch((err) => {
      if (err instanceof CircuitBreakerOpenError) {
        logger.error("Cloudinary upload rejected — circuit breaker is open", {
          folder,
        });
        throw new ServiceUnavailableError(
          "Image upload is temporarily unavailable, please try again shortly",
        );
      }
      throw err;
    });
};

/**
 * uploadAvatar — same upload mechanism as uploadImage, but with avatar-
 * appropriate transformations: a square face-aware crop instead of the
 * "fit within a box" limit used for ad photos, since avatars are always
 * displayed in circular/square thumbnails, not full-width galleries.
 *
 * Shares uploadBreaker with uploadImage — both go through Cloudinary's
 * same upload_stream API, so a failure pattern affecting one is a
 * genuine signal about the other too (unlike upload vs. delete, which
 * are different API operations that can fail independently).
 */
export const uploadAvatar = async (buffer: Buffer): Promise<UploadResult> => {
  return uploadBreaker
    .execute(async () => {
      const uploadPromise = new Promise<UploadResult>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "classifieds/avatars",
              timeout: UPLOAD_TIMEOUT_MS,
              transformation: [
                { width: 400, height: 400, crop: "fill", gravity: "face" },
                { quality: "auto:good" },
                { format: "webp" },
              ],
            },
            (error, result) => {
              if (error || !result)
                return reject(new Error("Avatar upload failed"));
              resolve({ url: result.secure_url, publicId: result.public_id });
            },
          )
          .end(buffer);
      });

      try {
        return await withTimeout(
          uploadPromise,
          UPLOAD_TIMEOUT_MS,
          "avatar upload",
        );
      } catch (err) {
        if (err instanceof CloudinaryTimeoutError) {
          logger.error("Cloudinary avatar upload timed out", {
            timeoutMs: UPLOAD_TIMEOUT_MS,
          });
        }
        throw err;
      }
    })
    .catch((err) => {
      if (err instanceof CircuitBreakerOpenError) {
        logger.error(
          "Cloudinary avatar upload rejected — circuit breaker is open",
        );
        throw new ServiceUnavailableError(
          "Avatar upload is temporarily unavailable, please try again shortly",
        );
      }
      throw err;
    });
};

export const deleteImage = async (publicId: string): Promise<void> => {
  await deleteBreaker
    .execute(async () => {
      try {
        await withTimeout(
          cloudinary.uploader.destroy(publicId, {
            // Cloudinary's own destroy() *does* accept `timeout` at
            // runtime (same two-layer design as uploadImage/uploadAvatar
            // above), but this SDK version's TypeScript definitions omit
            // it from the destroy() options type — hence the cast. The
            // destroy() options parameter type is a union with an
            // incompatible function-shaped overload member (its optional
            // ResponseCallback), so a direct cast to that parameter type
            // is rejected; going through `unknown` first is the safe,
            // narrow way to bypass just this one missing-field gap.
            timeout: DELETE_TIMEOUT_MS,
          } as unknown as Parameters<typeof cloudinary.uploader.destroy>[1]),
          DELETE_TIMEOUT_MS,
          "image delete",
        );
      } catch (err) {
        if (err instanceof CloudinaryTimeoutError) {
          logger.error("Cloudinary delete timed out", {
            publicId,
            timeoutMs: DELETE_TIMEOUT_MS,
          });
        }
        throw err;
      }
    })
    .catch((err) => {
      if (err instanceof CircuitBreakerOpenError) {
        logger.error("Cloudinary delete rejected — circuit breaker is open", {
          publicId,
        });
      }
      throw err;
    });
};

/**
 * Exported for observability/testing only — lets health checks or
 * tests inspect breaker state without exposing the breaker instances
 * themselves (which would let a caller call .reset() from anywhere,
 * defeating the point of the breaker tripping in the first place).
 */
export const getCloudinaryCircuitState = () => ({
  upload: uploadBreaker.getState(),
  delete: deleteBreaker.getState(),
});
