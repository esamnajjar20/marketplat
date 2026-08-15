'use client';

import { useState } from 'react';
import Image, { type ImageProps } from 'next/image';
import { PLACEHOLDER_SVG, PLACEHOLDER_AVATAR_SVG } from '@/lib/cloudinary';

/**
 * SafeImage — next/image with a real runtime error fallback.
 *
 * FIX UX-12: getImageProps/getThumbnailUrl/PLACEHOLDER_SVG only cover
 * the "no URL provided" case (falls back before render). None of the
 * 28 files using next/image had an `onError` handler, so a URL that
 * *exists* but fails to actually load at runtime (a Cloudinary asset
 * deleted after the DB record kept the URL, a transient 404, a
 * network blip) rendered the browser's broken-image icon instead of
 * the app's placeholder. This wraps next/image and swaps `src` to a
 * placeholder on error, covering the case the pre-render checks miss.
 *
 * Usage: drop-in replacement for next/image. Pass `variant="avatar"`
 * for the round person-silhouette placeholder instead of the generic
 * grey rectangle.
 */
export function SafeImage({
  variant = 'default',
  onError,
  src,
  alt,
  placeholder,
  blurDataURL,
  ...props
}: ImageProps & { variant?: 'default' | 'avatar' }) {
  const fallback = variant === 'avatar' ? PLACEHOLDER_AVATAR_SVG : PLACEHOLDER_SVG;
  const [errored, setErrored] = useState(false);

  // Once we've swapped to the fallback data-URI, drop any blur-up props
  // from the original call — applying a Cloudinary blurDataURL to an
  // unrelated inline SVG placeholder has no meaning and next/image will
  // just warn about it.
  return (
    <Image
      {...props}
      alt={alt}
      src={errored ? fallback : src}
      unoptimized={errored ? true : props.unoptimized}
      {...(errored ? {} : { placeholder, blurDataURL })}
      onError={(e) => {
        setErrored(true);
        onError?.(e);
      }}
    />
  );
}
