'use client';

import { useState } from 'react';
import Image, { type ImageProps } from 'next/image';
import { PLACEHOLDER_SVG, PLACEHOLDER_AVATAR_SVG } from '@/lib/cloudinary';
import { isDataSaverEnabled } from '@/lib/dataSaver';

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
  // Track WHICH src failed, not just that a failure happened. The
  // previous `useState(false)` stayed true forever once any error
  // fired — including when the SAME component instance was reused for
  // a DIFFERENT src by React (the image carousel in AdDetail.tsx
  // swapping currentImg, ChatWindow switching conversations, any list
  // reusing a row's cell). Those cases all rendered the grey fallback
  // for a perfectly valid new image, because React reconciles the same
  // SafeImage instance and never remounts, so `errored` was never
  // reset. Deriving it from (erroredSrc === current src) makes the
  // fallback automatically clear the moment src changes, with no
  // useEffect and no extra render — the same "reset state when a
  // prop changes" pattern the React docs recommend over useEffect.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);
  const currentSrc = typeof src === 'string' ? src : '';
  const errored = erroredSrc !== null && erroredSrc === currentSrc;

  // Data-saver: skip blur-up placeholders (extra network request for
  // a tiny LQIP) — the final image alone is enough on slow links.
  const saver = typeof window !== 'undefined' && isDataSaverEnabled();
  const blurProps = errored || saver ? {} : { placeholder, blurDataURL };

  return (
    <Image
      {...props}
      alt={alt}
      src={errored ? fallback : src}
      unoptimized={errored ? true : props.unoptimized}
      {...blurProps}
      onError={(e) => {
        setErroredSrc(currentSrc);
        onError?.(e);
      }}
    />
  );
}
