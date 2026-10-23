import Image from 'next/image';

interface CloudinaryImageProps {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}

/**
 * Unified image primitive for MarketPlat.
 *
 * - https://res.cloudinary.com/*  -> next/image with Cloudinary's f_auto,q_auto
 *   injected (when missing) so the CDN handles format/quality optimisation.
 *   width/height are required (prevents layout shift) and loading defaults
 *   to lazy.
 * - blob: / data:                -> native  with loading="lazy" decoding="async"
 *   (Next.js cannot optimise dynamic URLs; preserves blob/data images as-is).
 * - anything else (relative URLs) -> next/image with unoptimized for SVGs.
 */
export function CloudinaryImage({
  src,
  alt = '',
  width,
  height,
  className,
  priority = false,
}: CloudinaryImageProps) {
  const isCloudinary = src.startsWith('https://res.cloudinary.com');
  const isBlobOrData = src.startsWith('blob:') || src.startsWith('data:');

  // Dynamic / blob / data URLs: render natively, never through next/image.
  if (isBlobOrData) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
      />
    );
  }

  if (isCloudinary) {
    // Ask Cloudinary for automatic format + quality unless already present.
    const cloudinarySrc = src.includes('/upload/f_auto,q_auto/')
      ? src
      : src.replace(/\/upload\//, '/upload/f_auto,q_auto/');

    return (
      <Image
        src={cloudinarySrc}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        className={className}
      />
    );
  }

  // Relative URLs (e.g. SVGs): bypass Next.js image optimisation.
  const isSvg = src.toLowerCase().endsWith('.svg');
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      unoptimized={isSvg}
      className={className}
    />
  );
}
