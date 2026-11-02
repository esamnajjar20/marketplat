'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const isLoaded = loadedSrc === src;
  const hasFailed = failedSrc === src;

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
        onError={() => {
          setFailedSrc(src);
          setLoadedSrc(src);
        }}
      />
      {!isLoaded && !hasFailed && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] animate-pulse bg-gradient-to-br from-muted via-muted/60 to-muted/90"
        />
      )}
      {hasFailed && (
        <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
          <ImageOff className="h-8 w-8 opacity-70" aria-hidden="true" />
          <span className="text-sm font-medium">تعذّر تحميل الصورة</span>
        </div>
      )}
    </>
  );
}
