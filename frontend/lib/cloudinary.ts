/**
 * Cloudinary helpers — server-safe, no SDK required.
 *
 * All functions operate on Cloudinary delivery URLs and apply
 * transformations via the URL-based transformation API.
 *
 * Reference: https://cloudinary.com/documentation/image_transformations
 *
 * Transformation string format:
 *   https://res.cloudinary.com/<cloud>/image/upload/<transforms>/v<version>/<public_id>
 */

/** Supported image formats for auto-format delivery. */
type ImageFormat = 'auto' | 'webp' | 'avif' | 'jpg' | 'png';

/** Supported crop modes. */
type CropMode = 'fill' | 'fit' | 'crop' | 'scale' | 'thumb' | 'pad';

/** Supported gravity values for smart cropping. */
type Gravity =
  | 'auto'
  | 'face'
  | 'faces'
  | 'center'
  | 'north'
  | 'south'
  | 'east'
  | 'west';

export interface CloudinaryTransformOptions {
  width?:   number;
  height?:  number;
  crop?:    CropMode;
  gravity?: Gravity;
  quality?: number | 'auto';
  format?:  ImageFormat;
  /** Apply a blur effect (1–2000). Useful for placeholder blur-up. */
  blur?:    number;
  /** Round corners (pixels or 'max' for circle). */
  radius?:  number | 'max';
}

// ── Core transform builder ─────────────────────────────────────────

/**
 * Returns true if the URL is a Cloudinary delivery URL.
 * Handles both res.cloudinary.com and custom CNAME domains.
 */
export function isCloudinaryUrl(url: string): boolean {
  return url.includes('res.cloudinary.com') || url.includes('.cloudinary.com');
}

/**
 * Insert a transformation string into an existing Cloudinary URL.
 * Handles both versioned (v1234/…) and unversioned paths.
 *
 * Input:  https://res.cloudinary.com/demo/image/upload/v1234/sample.jpg
 * Output: https://res.cloudinary.com/demo/image/upload/w_400,h_300,c_fill/v1234/sample.jpg
 */
export function applyTransformation(
  url: string,
  transforms: string,
): string {
  if (!url || !isCloudinaryUrl(url)) return url;
  if (!transforms) return url;

  // Find the insertion point: after /upload/
  const uploadMarker = '/upload/';
  const idx = url.indexOf(uploadMarker);
  if (idx === -1) return url;

  const before = url.slice(0, idx + uploadMarker.length);
  const after  = url.slice(idx + uploadMarker.length);

  // Avoid doubling transforms if already present
  if (after.startsWith(transforms)) return url;

  return `${before}${transforms}/${after}`;
}

/**
 * Build a Cloudinary transformation string from an options object.
 *
 * Example output: "w_800,h_600,c_fill,g_auto,f_auto,q_auto"
 */
export function buildTransformString(opts: CloudinaryTransformOptions): string {
  const parts: string[] = [];

  if (opts.width)   parts.push(`w_${opts.width}`);
  if (opts.height)  parts.push(`h_${opts.height}`);
  if (opts.crop)    parts.push(`c_${opts.crop}`);
  if (opts.gravity) parts.push(`g_${opts.gravity}`);
  if (opts.quality) parts.push(`q_${opts.quality}`);
  if (opts.format)  parts.push(`f_${opts.format}`);
  if (opts.blur)    parts.push(`e_blur:${opts.blur}`);
  if (opts.radius)  parts.push(`r_${opts.radius}`);

  return parts.join(',');
}

// ── High-level helpers ─────────────────────────────────────────────

/**
 * Return an optimised URL for a given Cloudinary image.
 * Automatically applies f_auto (WebP/AVIF delivery) and q_auto.
 */
export function getOptimisedUrl(
  url: string,
  opts: Omit<CloudinaryTransformOptions, 'format' | 'quality'> = {},
): string {
  const transforms = buildTransformString({
    ...opts,
    format:  'auto',
    quality: 'auto',
  });
  return applyTransformation(url, transforms);
}

/**
 * Return a thumbnail URL — cropped to exact dimensions, face-aware.
 *
 * Used for ad list cards and search results.
 */
export function getThumbnailUrl(
  url: string,
  width  = 400,
  height = 300,
): string {
  return getOptimisedUrl(url, {
    width,
    height,
    crop:    'fill',
    gravity: 'auto',
  });
}

/**
 * Return a tiny blurred placeholder (20px wide) for blur-up loading.
 * Pass the returned URL as the `blurDataURL` prop of next/image.
 */
export function getPlaceholderUrl(url: string): string {
  if (!isCloudinaryUrl(url)) return PLACEHOLDER_SVG;
  const transforms = buildTransformString({
    width:   20,
    quality: 30,
    blur:    500,
    format:  'jpg',
  });
  return applyTransformation(url, transforms);
}

/**
 * Return a responsive srcSet-friendly URL for a hero or detail image.
 * Maintains aspect ratio, delivers at up to 1200px wide.
 */
export function getDetailImageUrl(url: string, maxWidth = 1200): string {
  return getOptimisedUrl(url, {
    width: maxWidth,
    crop:  'scale',
  });
}

/**
 * Return a circular avatar URL — cropped to a square with max radius.
 */
export function getAvatarUrl(url: string, size = 96): string {
  if (!url) return PLACEHOLDER_AVATAR_SVG;
  return getOptimisedUrl(url, {
    width:   size,
    height:  size,
    crop:    'thumb',
    gravity: 'face',
    radius:  'max',
  });
}

/**
 * Return an OG image URL — 1200×630, suitable for social sharing.
 */
export function getOgImageUrl(url: string): string {
  return getOptimisedUrl(url, {
    width:  1200,
    height: 630,
    crop:   'fill',
  });
}

// ── Fallback placeholders (inline SVG data URLs) ──────────────────

/**
 * Generic image placeholder — light grey rectangle.
 * Used when an ad has no images or the URL is invalid.
 */
export const PLACEHOLDER_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23e2e8f0'/%3E%3Ctext x='200' y='160' text-anchor='middle' fill='%2394a3b8' font-size='14' font-family='sans-serif'%3ENo image%3C/text%3E%3C/svg%3E";

/**
 * Avatar placeholder — grey circle with a person silhouette.
 * Used when a user has no profile picture.
 */
export const PLACEHOLDER_AVATAR_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Ccircle cx='48' cy='48' r='48' fill='%23e2e8f0'/%3E%3Ccircle cx='48' cy='38' r='16' fill='%2394a3b8'/%3E%3Cellipse cx='48' cy='80' rx='26' ry='18' fill='%2394a3b8'/%3E%3C/svg%3E";

// ── next/image helper ─────────────────────────────────────────────

/**
 * Returns props ready to spread onto a <Image> component.
 * Handles missing/invalid URLs gracefully with a placeholder.
 *
 * Usage:
 *   <Image {...getImageProps(ad.thumbnail, { width: 400, height: 300, alt: ad.title })} />
 */
export function getImageProps(
  url: string | null | undefined,
  opts: {
    width:  number;
    height: number;
    alt:    string;
    crop?:  CropMode;
  },
): {
  src:           string;
  width:         number;
  height:        number;
  alt:           string;
  placeholder:   'blur' | 'empty';
  blurDataURL?:  string;
} {
  const src = url && isCloudinaryUrl(url)
    ? getThumbnailUrl(url, opts.width, opts.height)
    : (url ?? PLACEHOLDER_SVG);

  const blurDataURL = url && isCloudinaryUrl(url)
    ? getPlaceholderUrl(url)
    : undefined;

  return {
    src,
    width:      opts.width,
    height:     opts.height,
    alt:        opts.alt,
    placeholder: blurDataURL ? 'blur' : 'empty',
    ...(blurDataURL && { blurDataURL }),
  };
}
