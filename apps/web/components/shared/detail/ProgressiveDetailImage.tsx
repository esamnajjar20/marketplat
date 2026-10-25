'use client';

import { useState } from 'react';
import { SafeImage } from '@/components/shared/ui/SafeImage';

interface Props {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  loading?: 'eager' | 'lazy';
  draggable?: boolean;
}

/** Image-first progressive rendering: reserve the gallery frame and keep a quiet placeholder until the real image loads. */
export function ProgressiveDetailImage({
  src,
  alt,
  className = 'object-contain',
  sizes = '(max-width: 1024px) 100vw, 66vw',
  priority = false,
  loading,
  draggable = false,
}: Props) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const isLoaded = loadedSrc === src;

  return (
    <>
      <SafeImage
        src={src}
        alt={alt}
        fill
        className={className}
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : (loading ?? 'lazy')}
        draggable={draggable}
        onLoad={() => setLoadedSrc(src)}
        onError={() => setLoadedSrc(src)}
      />
      {!isLoaded && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] animate-pulse bg-gradient-to-br from-muted via-muted/60 to-muted/90"
        />
      )}
    </>
  );
}
