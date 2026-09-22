import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';
import { logger } from '../shared/utils/logger';
import { CircuitBreaker, CircuitBreakerOpenError } from '../shared/utils/circuitBreaker';
import { ServiceUnavailableError } from '../shared/errors/ServiceUnavailableError';

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
 * distributed lock) for as long as Cloudinary took to respond.
 *
 * Two layers, since either one alone can fail to actually stop things:
 *   1. `timeout` passed to Cloudinary's own upload/destroy options —
 *      asks the underlying HTTP client to abort the socket.
 *   2. withTimeout() wraps the returned Promise as a fallback in case
 *      the SDK ignores its own `timeout` option (e.g. hangs during DNS
 *      resolution before the SDK's internal timer even starts).
 *
 * 20s for uploads (image processing + up to 5MB over a slow connection
 * is legitimately slow), 10s for delete (small, fast API call).
 */
const UPLOAD_TIMEOUT_MS = 20_000;
const DELETE_TIMEOUT_MS = 10_000;

class CloudinaryTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Cloudinary ${operation} timed out after ${timeoutMs}ms`);
    this.name = 'CloudinaryTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CloudinaryTimeoutError(operation, timeoutMs));
    }, timeoutMs);
    timer.unref();

    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * PROD-FIX-12: two independent circuit breakers — one for uploads, one
 * for deletes. Kept separate deliberately: a Cloudinary account issue
 * that specifically breaks destroy() (e.g. a permissions problem)
 * shouldn't also block new ad creation, and vice versa. Both trip
 * after 5 consecutive failures and stay OPEN for 30s before allowing
 * a trial call.
 */
const uploadBreaker = new CircuitBreaker({
  name: 'cloudinary-upload',
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

const deleteBreaker = new CircuitBreaker({
  name: 'cloudinary-delete',
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

// ── Transformation presets ────────────────────────────────────────
// Extracted so the five upload helpers below stay one-liners. Same
// values as before the refactor — ad photos fit within 1200×800
// (limit, preserves aspect ratio); avatars get a face-aware square
// crop for circular thumbnails; store logos are a non-face square
// crop; store covers are a 3:1 banner; service-provider logos match
// store logos. All use auto:good quality and WebP output.
const TRANSFORM_IMAGE: object[] = [
  { width: 1200, height: 800, crop: 'limit' },
  { quality: 'auto:good' },
  { format: 'webp' },
];
const TRANSFORM_AVATAR: object[] = [
  { width: 400, height: 400, crop: 'fill', gravity: 'face' },
  { quality: 'auto:good' },
  { format: 'webp' },
];
const TRANSFORM_SQUARE: object[] = [
  { width: 400, height: 400, crop: 'fill' },
  { quality: 'auto:good' },
  { format: 'webp' },
];
const TRANSFORM_COVER: object[] = [
  { width: 1200, height: 400, crop: 'fill' },
  { quality: 'auto:good' },
  { format: 'webp' },
];

// ── Generic upload helper ─────────────────────────────────────────
// FIX T66: previously each of the five upload helpers (image, avatar,
// store logo, store cover, service-provider logo) repeated ~60 lines
// of identical boilerplate — the same upload_stream callback, the same
// CloudinaryTimeoutError catch-and-log, the same CircuitBreakerOpenError
// → ServiceUnavailableError mapping. Only two values ever differed:
// the destination folder and the transformation preset. That made
// every change to the error/timeout handling a five-site edit, and
// each new entity type added another ~60 lines. This collapses all of
// it into a single helper; the five exported wrappers below are now
// two lines each.
async function uploadWithTransform(
  buffer: Buffer,
  folder: string,
  transformation: object[],
  label: string
): Promise<UploadResult> {
  return uploadBreaker
    .execute(async () => {
      const uploadPromise = new Promise<UploadResult>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder,
              timeout: UPLOAD_TIMEOUT_MS,
              transformation,
            },
            (error, result) => {
              if (error || !result) {
                logger.error(`Cloudinary ${label} returned an error`, {
                  folder,
                  cloudinaryError: error
                    ? {
                        message: error.message,
                        name: error.name,
                        http_code: (error as { http_code?: number }).http_code,
                      }
                    : 'no error object, but no result either',
                });
                return reject(
                  new ServiceUnavailableError(
                    'Image upload is temporarily unavailable, please try again shortly'
                  )
                );
              }
              resolve({ url: result.secure_url, publicId: result.public_id });
            }
          )
          .end(buffer);
      });

      try {
        return await withTimeout(uploadPromise, UPLOAD_TIMEOUT_MS, label);
      } catch (err) {
        if (err instanceof CloudinaryTimeoutError) {
          logger.error(`Cloudinary ${label} timed out`, {
            folder,
            timeoutMs: UPLOAD_TIMEOUT_MS,
          });
        }
        throw err;
      }
    })
    .catch(err => {
      if (err instanceof CircuitBreakerOpenError) {
        logger.error(`Cloudinary ${label} rejected — circuit breaker is open`, {
          folder,
        });
        throw new ServiceUnavailableError(
          'Image upload is temporarily unavailable, please try again shortly'
        );
      }
      throw err;
    });
}

// ── Public upload helpers (thin wrappers) ─────────────────────────

export const uploadImage = (buffer: Buffer, folder: string): Promise<UploadResult> =>
  uploadWithTransform(buffer, `classifieds/${folder}`, TRANSFORM_IMAGE, 'image upload');

export const uploadAvatar = (buffer: Buffer): Promise<UploadResult> =>
  uploadWithTransform(buffer, 'classifieds/avatars', TRANSFORM_AVATAR, 'avatar upload');

export const uploadStoreLogo = (buffer: Buffer): Promise<UploadResult> =>
  uploadWithTransform(buffer, 'classifieds/store-logos', TRANSFORM_SQUARE, 'store logo upload');

export const uploadStoreCover = (buffer: Buffer): Promise<UploadResult> =>
  uploadWithTransform(buffer, 'classifieds/store-covers', TRANSFORM_COVER, 'store cover upload');

export const uploadServiceProviderLogo = (buffer: Buffer): Promise<UploadResult> =>
  uploadWithTransform(
    buffer,
    'classifieds/service-provider-logos',
    TRANSFORM_SQUARE,
    'service provider logo upload'
  );

// ── Delete ────────────────────────────────────────────────────────

export const deleteImage = async (publicId: string): Promise<void> => {
  await deleteBreaker
    .execute(async () => {
      try {
        await withTimeout(
          cloudinary.uploader.destroy(publicId, {
            // Cloudinary's own destroy() *does* accept `timeout` at
            // runtime, but this SDK version's TypeScript definitions
            // omit it from the destroy() options type — hence the cast.
            timeout: DELETE_TIMEOUT_MS,
          } as unknown as Parameters<typeof cloudinary.uploader.destroy>[1]),
          DELETE_TIMEOUT_MS,
          'image delete'
        );
      } catch (err) {
        if (err instanceof CloudinaryTimeoutError) {
          logger.error('Cloudinary delete timed out', {
            publicId,
            timeoutMs: DELETE_TIMEOUT_MS,
          });
        }
        throw err;
      }
    })
    .catch(err => {
      if (err instanceof CircuitBreakerOpenError) {
        logger.error('Cloudinary delete rejected — circuit breaker is open', {
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
