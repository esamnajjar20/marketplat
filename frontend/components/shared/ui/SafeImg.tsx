'use client';

import { useState, type ImgHTMLAttributes } from 'react';
import { PLACEHOLDER_SVG, PLACEHOLDER_AVATAR_SVG } from '@/lib/cloudinary';

/**
 * SafeImg — plain <img> with the same runtime fallback as SafeImage.
 *
 * Use it where next/image is not an option: sources that may live on a
 * host outside next.config's remotePatterns (e.g. Google profile
 * pictures stored as avatarUrl, which next/image would reject), or
 * full-size lightbox / chat images with unknown dimensions. For
 * Cloudinary-hosted images with known layout keep using SafeImage.
 *
 * Fallback is keyed on the src that failed (same pattern as
 * SafeImage), so reusing one instance for a new src clears it.
 * Never use for blob:/data: previews — those cannot fail this way.
 */
export function SafeImg({
  variant = 'default',
  src,
  alt,
  onError,
  loading = 'lazy',
  decoding = 'async',
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  variant?: 'default' | 'avatar';
}) {
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);
  const fallback = variant === 'avatar' ? PLACEHOLDER_AVATAR_SVG : PLACEHOLDER_SVG;
  const errored = erroredSrc === src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={errored ? fallback : src}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={(e) => {
        setErroredSrc(src);
        onError?.(e);
      }}
    />
  );
}
