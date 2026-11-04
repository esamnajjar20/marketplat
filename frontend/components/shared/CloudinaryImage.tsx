import Image from 'next/image';

interface CloudinaryImageProps {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

/**
 * Unified image primitive for MarketPlat.
 *
 * - https://res.cloudinary.com/*  -> next/image with Cloudinary's f_auto,q_auto
 *   injected (when missing) so the CDN handles format/quality optimisation.
 *   width/height are required (prevents layout shift); `sizes` controls the
 *   responsive slot width and `priority` is reserved for above-the-fold LCP.
 * - SVG URLs                     -> unoptimized to avoid the Next image optimizer.
 * - blob: / data:                -> native <img> with explicit dimensions.
 *   (Next.js cannot optimise dynamic URLs; preserves blob/data images as-is).
 * - anything else (relative URLs) -> next/image with unoptimized for SVGs.
 */
export function CloudinaryImage({
  src,
  alt = '',
  width,
  height,
  className,
  sizes,
  priority = false,
}: CloudinaryImageProps) {
  const isCloudinary = src.startsWith('https://res.cloudinary.com');
  const isBlobOrData = src.startsWith('blob:') || src.startsWith('data:');
  const isSvg = (() => {
    try {
      return new URL(src, 'https://marketplat.invalid').pathname.toLowerCase().endsWith('.svg');
    } catch {
      return /\.svg(?:$|[?#])/i.test(src);
    }
  })();

  // Dynamic / blob / data URLs: render natively, never through next/image.
  if (isBlobOrData) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={className}
      />
    );
  }

  if (isCloudinary) {
    // Ask Cloudinary for automatic format + quality unless already present.
    // Do not route uploaded SVGs through the Next image optimizer. This is
    // important even while SVG support is disabled in next.config: the image
    // optimizer has had SVG content-type classification bypass advisories.
    const cloudinarySrc = isSvg || src.includes('/upload/f_auto,q_auto/')
      ? src
      : src.replace(/\/upload\//, '/upload/f_auto,q_auto/');

    return (
      <Image
        src={cloudinarySrc}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes={sizes}
        unoptimized={isSvg}
        className={className}
      />
    );
  }

  // Non-Cloudinary sources are validated by next.config remotePatterns.
  // SVG URLs bypass the optimizer; normal raster images use responsive output.
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      sizes={sizes}
      unoptimized={isSvg}
      className={className}
    />
  );
}
