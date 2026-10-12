'use client';

import { useCallback, useEffect, useRef, useState, type TouchEvent, type WheelEvent } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { ProgressiveDetailImage } from '@/components/shared/detail/ProgressiveDetailImage';
import { isDataSaverEnabled } from '@/lib/dataSaver';

interface Props {
  src: string;
  alt: string;
  onSwipeNext: () => void;
  onSwipePrevious: () => void;
  priority?: boolean;
  nextSrc?: string;
  previousSrc?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** Full-screen image with bounded zoom, pinch, pan, and swipe navigation. */
export function ZoomableDetailImage({ src, alt, onSwipeNext, onSwipePrevious, priority = false, nextSrc, previousSrc }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const touchRef = useRef<{ x: number; y: number; distance: number; zoom: number; offsetX: number; offsetY: number } | null>(null);
  const lastTapRef = useRef(0);

  // Warm only the immediately adjacent full-size images while the lightbox is open.
  // Respect data-saver settings and release handlers on image changes/unmount.
  useEffect(() => {
    if (isDataSaverEnabled()) return;
    const candidates = [nextSrc, previousSrc].filter((value): value is string => Boolean(value && value !== src));
    const preloads = candidates.map((candidate) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.loading = 'eager';
      image.src = candidate;
      return image;
    });
    return () => {
      for (const image of preloads) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [src, nextSrc, previousSrc]);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const changeZoom = useCallback((next: number) => {
    const bounded = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    setZoom(bounded);
    if (bounded === 1) setOffset({ x: 0, y: 0 });
  }, []);
type TouchLikeList = { length: number; [index: number]: { clientX: number; clientY: number } };


  const distance = (touches: TouchLikeList) => {
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) return 0;
    const dx = first.clientX - second.clientX;
    const dy = first.clientY - second.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const touches = event.touches;
    const now = Date.now();
    if (touches.length === 1 && now - lastTapRef.current < 280) {
      changeZoom(zoom > 1 ? 1 : 2);
      lastTapRef.current = 0;
    } else if (touches.length === 1) {
      lastTapRef.current = now;
    }
    touchRef.current = {
      x: touches[0]?.clientX ?? 0,
      y: touches[0]?.clientY ?? 0,
      distance: touches.length > 1 ? distance(touches) : 0,
      zoom,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const start = touchRef.current;
    if (!start) return;
    if (event.touches.length >= 2) {
      event.preventDefault();
      const startDistance = start.distance || distance(event.touches);
      changeZoom(start.zoom * (distance(event.touches) / Math.max(1, startDistance)));
    } else if (zoom > 1 && event.touches[0]) {
      event.preventDefault();
      setOffset({ x: start.offsetX + event.touches[0].clientX - start.x, y: start.offsetY + event.touches[0].clientY - start.y });
    }
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const start = touchRef.current;
    if (start && zoom === 1 && event.changedTouches[0] && event.changedTouches.length === 1) {
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (dx < 0) onSwipeNext(); else onSwipePrevious();
      }
    }
    touchRef.current = null;
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden touch-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      onDoubleClick={() => changeZoom(zoom > 1 ? 1 : 2)}
      aria-label="يمكن تكبير الصورة باللمس مرتين أو باستخدام أدوات التكبير"
    >
      <div
        className="absolute inset-0"
        style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`, transformOrigin: 'center center', transition: touchRef.current ? 'none' : 'transform 120ms ease-out' }}
      >
        <ProgressiveDetailImage src={src} alt={alt} className="object-contain select-none pointer-events-none" sizes="100vw" priority={priority} loading="eager" draggable={false} />
      </div>
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 p-1.5 backdrop-blur" aria-label="أدوات تكبير الصورة">
        <button type="button" onClick={() => changeZoom(zoom - 0.5)} disabled={zoom <= MIN_ZOOM} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="تصغير الصورة"><Minus className="h-5 w-5" /></button>
        <span className="min-w-12 text-center text-xs tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => changeZoom(zoom + 0.5)} disabled={zoom >= MAX_ZOOM} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="تكبير الصورة"><Plus className="h-5 w-5" /></button>
        <button type="button" onClick={reset} disabled={zoom === 1 && offset.x === 0 && offset.y === 0} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="إعادة ضبط التكبير"><RotateCcw className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
