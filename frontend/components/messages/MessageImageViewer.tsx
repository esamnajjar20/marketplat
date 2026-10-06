'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getFullscreenImageUrl, getGalleryThumbnailUrl } from '@/lib/cloudinary';

type ImageItem = { id: string; imageUrl: string; alt?: string };

interface Props {
  images: ImageItem[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;
const SWIPE_THRESHOLD = 56;

export function MessageImageViewer({ images, initialIndex, open, onOpenChange }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  const current = images[index];

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback((next: number) => {
    if (!images.length) return;
    setIndex((next + images.length) % images.length);
    resetView();
  }, [images.length, resetView]);

  useEffect(() => {
    if (!open) return;
    setIndex(Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0)));
    resetView();
  }, [open, initialIndex, images.length, resetView]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
      else if (event.key === 'ArrowLeft') goTo(index - 1);
      else if (event.key === 'ArrowRight') goTo(index + 1);
      else if (event.key === '+' || event.key === '=') setScale((v) => Math.min(MAX_SCALE, v + SCALE_STEP));
      else if (event.key === '-') setScale((v) => Math.max(MIN_SCALE, v - SCALE_STEP));
      else if (event.key === '0') resetView();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, index, goTo, onOpenChange, resetView]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (scale > 1) setOffset({ x: drag.offsetX + dx, y: drag.offsetY + dy });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || scale > 1) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) >= SWIPE_THRESHOLD) goTo(index + (dx < 0 ? 1 : -1));
  };

  const zoom = (delta: number) => {
    setScale((currentScale) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale + delta));
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(94vh,900px)] w-[min(96vw,1200px)] max-w-none border-0 bg-black/95 p-0 text-white shadow-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">عارض الصور</DialogTitle>
        <div className="relative flex h-full min-h-0 flex-col">
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 to-transparent p-3 pb-8">
            <span className="rounded-full bg-black/45 px-3 py-1 text-xs tabular-nums backdrop-blur">
              {index + 1} / {images.length}
            </span>
            <div className="flex items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur">
              <button type="button" onClick={() => zoom(-SCALE_STEP)} disabled={scale <= MIN_SCALE} className="rounded-full p-2 hover:bg-white/15 disabled:opacity-35" aria-label="تصغير"><Minus className="h-4 w-4" /></button>
              <span className="min-w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
              <button type="button" onClick={() => zoom(SCALE_STEP)} disabled={scale >= MAX_SCALE} className="rounded-full p-2 hover:bg-white/15 disabled:opacity-35" aria-label="تكبير"><Plus className="h-4 w-4" /></button>
              <button type="button" onClick={resetView} className="rounded-full p-2 hover:bg-white/15" aria-label="إعادة ضبط"><RotateCcw className="h-4 w-4" /></button>
              <a href={current.imageUrl} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 hover:bg-white/15" aria-label="فتح الصورة"><span className="text-sm">↗</span></a>
              <a href={current.imageUrl} download className="rounded-full p-2 hover:bg-white/15" aria-label="تنزيل الصورة"><Download className="h-4 w-4" /></a>
              <button type="button" onClick={() => onOpenChange(false)} className="rounded-full p-2 hover:bg-white/15" aria-label="إغلاق"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {images.length > 1 && <>
            <button type="button" onClick={() => goTo(index - 1)} className="absolute start-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/55 p-3 backdrop-blur transition hover:bg-black/75" aria-label="الصورة السابقة"><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" onClick={() => goTo(index + 1)} className="absolute end-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/55 p-3 backdrop-blur transition hover:bg-black/75" aria-label="الصورة التالية"><ChevronRight className="h-6 w-6" /></button>
          </>}

          <div
            className={cn('flex min-h-0 flex-1 touch-pan-y select-none items-center justify-center overflow-hidden p-3 sm:p-8', scale > 1 && 'cursor-grab active:cursor-grabbing')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { dragRef.current = null; }}
            onDoubleClick={() => scale === 1 ? setScale(2) : resetView()}
          >
            <img
              key={current.id}
              src={getFullscreenImageUrl(current.imageUrl)}
              alt={current.alt ?? 'صورة من المحادثة'}
              draggable={false}
              className="max-h-full max-w-full object-contain transition-transform duration-150 will-change-transform"
              style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
            />
          </div>

          {images.length > 1 && (
            <div className="shrink-0 overflow-x-auto bg-black/60 px-3 py-2">
              <div className="mx-auto flex w-max gap-2">
                {images.map((image, thumbnailIndex) => (
                  <button key={image.id} type="button" onClick={() => goTo(thumbnailIndex)} className={cn('h-14 w-14 overflow-hidden rounded-lg border-2 opacity-60 transition hover:opacity-100', thumbnailIndex === index && 'border-white opacity-100')} aria-label={`الصورة ${thumbnailIndex + 1}`}>
                    <img src={getGalleryThumbnailUrl(image.imageUrl, 120)} alt="" className="h-full w-full object-cover" draggable={false} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
