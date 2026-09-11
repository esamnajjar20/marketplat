/**
 * limits.ts — single source of truth for image-upload limits.
 *
 * Before this file, the same three values were each hardcoded
 * independently in 7 places:
 *   - MAX_IMAGES_PER_ENTITY (10): ads.service.ts (bare literal ×2, no
 *     constant at all), products.service.ts (MAX_PRODUCT_IMAGES),
 *     service-listings.service.ts (MAX_LISTING_IMAGES), and as a
 *     `maxImages = 10` default parameter in each of ads.repository.ts /
 *     products.repository.ts / service-listings.repository.ts.
 *   - MAX_IMAGE_SIZE_BYTES (5MB) and ALLOWED_MIME_TYPES: only in
 *     upload.middleware.ts, but with no named source other module could
 *     import from.
 * Changing any of these meant hunting down every copy by hand — this
 * consolidates them so there is exactly one place to change.
 *
 * Note: this is deliberately NOT the same list as fileSignature.ts's
 * DetectedImageType. That one is the set of magic-byte signatures this
 * app can actually recognize (3 canonical types — jpeg/jpg share one
 * signature) and is a different, narrower concept from "MIME types the
 * client is allowed to declare" (4 strings, including the jpg/jpeg
 * alias) below. They're related but not the same list, so they stay
 * separate rather than being forced together.
 */

export const MAX_IMAGES_PER_ENTITY = 10;

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per file

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
