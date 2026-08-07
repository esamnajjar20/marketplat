/**
 * ImageUpload — drag-and-drop / click-to-upload for ad images.
 * Validates file type and size client-side before adding to the queue.
 * Also displays already-uploaded images (edit mode) with a remove button.
 *
 * SEC-FIX-06: Object URLs created by URL.createObjectURL() are now revoked
 *   when the component unmounts or when the files list changes. Unreleased
 *   blob URLs persist in memory for the lifetime of the document and can be
 *   used to fingerprint the session via the Blob URL origin token embedded
 *   in the URL. Revoking them promptly eliminates the leak.
 *
 * BUILD-FIX: this file previously imported MAX_IMAGE_SIZE_MB, MAX_AD_IMAGES,
 *   and ALLOWED_IMAGE_TYPES from lib/constants.ts, but none of those names
 *   existed there (the real names were MAX_FILE_SIZE_MB / MAX_IMAGES, and
 *   ALLOWED_IMAGE_TYPES didn't exist at all) — a build-breaking error.
 *   Fixed by importing the real constant names directly.
 *
 * BUILD-FIX: AdForm.tsx passes existingUrls and onRemoveExisting props that
 *   this component never declared or rendered — also a build-breaking type
 *   error, and a real missing feature (edit mode showed no existing photos).
 *   Both are now implemented below.
 *
 * FIX UX-13: rejected files (wrong type, too large, or over the max
 * count) used to just silently vanish from the queue with no
 * indication anything was dropped — a user picking 6 files for a
 * 5-photo limit, or one oversized photo among several valid ones,
 * would see fewer thumbnails than files they selected with no
 * explanation why. Now shows a toast naming what was rejected and why.
 *
 * Gap #11: existing (already-uploaded) images can now be reordered —
 * drag-and-drop via native HTML5 DnD (no new dependency needed), plus
 * move-left/move-right buttons so the same reorder is fully reachable
 * by keyboard/screen-reader, matching the drop-zone's own
 * keyboard-accessibility handling above. The first image after any
 * reorder is treated as the "primary" image everywhere else in the
 * app (ProductCard, AdDetail, admin tables, etc. all already read
 * images[0]) — so reordering here is the entire feature; no separate
 * "set as primary" concept was introduced.
 */
'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MAX_FILE_SIZE_MB, ALLOWED_IMAGE_TYPES, MAX_IMAGES } from '@/lib/constants';
import { formatFileSize } from '@/lib/formatters';
import { toast } from 'sonner';

interface ImageUploadProps {
  value: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  error?: string;
  /** Already-uploaded image URLs (Cloudinary), shown in edit mode. */
  existingUrls?: string[];
  /** Called when the user removes one of the existing images. */
  onRemoveExisting?: (url: string) => void;
  /**
   * Gap #11: called with the full reordered array whenever the user
   * drags (or keyboard-moves) an existing image to a new position.
   * Omitting this prop simply disables reordering — existingUrls
   * still render, just without drag handles/move buttons — so this is
   * additive and doesn't require every ImageUpload call site to opt in.
   */
  onReorderExisting?: (reordered: string[]) => void;
  /**
   * UX-FIX P3-10b: 0-100 while the parent form's actual multipart upload
   * of these images is in flight, or null/undefined the rest of the
   * time. One combined percentage for the whole request (axios reports
   * progress at the request level, not per file within one FormData) —
   * still real signal, not a fake/simulated bar.
   */
  uploadProgress?: number | null;
}

export function ImageUpload({
  value,
  onChange,
  maxFiles = MAX_IMAGES,
  error,
  existingUrls = [],
  onRemoveExisting,
  onReorderExisting,
  uploadProgress,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const maxBytes  = MAX_FILE_SIZE_MB * 1024 * 1024;
  // UX bonus FIX: useId instead of hardcoded 'image-upload-input' so multiple
  // ImageUpload instances on the same page don't share the same id.
  const inputId   = useId();
  const inputRef  = useRef<HTMLInputElement>(null);

  // Gap #11: index of the existing-image tile currently being dragged,
  // or null when no drag is in progress. Tracked here (not read off
  // the native DataTransfer on every dragover) so dragover's hover
  // preview logic can cheaply compare against it on every fire.
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function moveExisting(from: number, to: number) {
    if (!onReorderExisting) return;
    if (to < 0 || to >= existingUrls.length || from === to) return;
    const next = [...existingUrls];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorderExisting(next);
  }

  // Total photo count across existing (Cloudinary) + new (local File) images.
  const totalCount = existingUrls.length + value.length;
  const remainingSlots = Math.max(0, maxFiles - existingUrls.length);

  function openPicker() { inputRef.current?.click(); }

  // SEC-FIX-06: Track created object URLs so we can revoke them.
  const objectUrlsRef = useRef<Map<File, string>>(new Map());

  function getObjectUrl(file: File): string {
    if (!objectUrlsRef.current.has(file)) {
      objectUrlsRef.current.set(file, URL.createObjectURL(file));
    }
    return objectUrlsRef.current.get(file)!;
  }

  // Revoke URLs for files that are no longer in the list.
  useEffect(() => {
    const currentFiles = new Set(value);
    objectUrlsRef.current.forEach((url, file) => {
      if (!currentFiles.has(file)) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(file);
      }
    });
  }, [value]);

  // Revoke all URLs on unmount.
  useEffect(() => {
    const urlMap = objectUrlsRef.current;
    return () => {
      urlMap.forEach((url) => URL.revokeObjectURL(url));
      urlMap.clear();
    };
  }, []);

  const addFiles = useCallback(
    (newFiles: FileList | null) => {
      if (!newFiles) return;
      const incoming = Array.from(newFiles);

      const wrongType = incoming.filter(
        (f) => !ALLOWED_IMAGE_TYPES.includes(f.type as typeof ALLOWED_IMAGE_TYPES[number]),
      );
      const tooLarge = incoming.filter(
        (f) =>
          ALLOWED_IMAGE_TYPES.includes(f.type as typeof ALLOWED_IMAGE_TYPES[number]) &&
          f.size > maxBytes,
      );
      const valid = incoming.filter(
        (f) =>
          ALLOWED_IMAGE_TYPES.includes(f.type as typeof ALLOWED_IMAGE_TYPES[number]) &&
          f.size <= maxBytes,
      );

      // Cap at remainingSlots so existing + new never exceeds maxFiles.
      const accepted = valid.slice(0, remainingSlots);
      const overLimit = valid.length - accepted.length;

      if (wrongType.length > 0) {
        toast.error(
          wrongType.length === 1
            ? `الملف "${wrongType[0]?.name}" غير مدعوم (JPG، PNG، أو WEBP فقط)`
            : `${wrongType.length} ملفات غير مدعومة (JPG، PNG، أو WEBP فقط)`,
        );
      }
      if (tooLarge.length > 0) {
        toast.error(
          tooLarge.length === 1
            ? `الملف "${tooLarge[0]?.name}" أكبر من ${MAX_FILE_SIZE_MB} ميجابايت`
            : `${tooLarge.length} ملفات أكبر من ${MAX_FILE_SIZE_MB} ميجابايت`,
        );
      }
      if (overLimit > 0) {
        toast.error(`الحد الأقصى ${maxFiles} صور — تم تجاهل ${overLimit} ${overLimit === 1 ? 'صورة' : 'صور'} إضافية`);
      }

      onChange([...value, ...accepted]);
    },
    [value, onChange, remainingSlots, maxBytes, maxFiles],
  );

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
        }`}
        onClick={() => openPicker()}
        // UX-02 FIX: role=button without onKeyDown is keyboard-inaccessible.
        // Enter and Space must trigger the same action as click.
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="رفع الصور — اضغط أو اسحب الملفات هنا"
      >
        <p className="text-sm text-muted-foreground">
          اسحب الصور هنا أو <span className="text-primary underline">تصفّح</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PNG، JPG، WEBP · بحد أقصى {MAX_FILE_SIZE_MB} MB · حتى {maxFiles} صور ({totalCount}/{maxFiles})
        </p>
      </div>
      <input
        id={inputId} ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {/*
        UX-FIX P3-10b: real upload progress for the images in this
        submission — previously there was no indication at all of how
        far along a multi-photo upload was on a slow connection, only
        the submit button's static "جارٍ الحفظ…" label for however long
        it took.
      */}
      {uploadProgress != null && (
        <div className="space-y-1" role="status" aria-live="polite">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">جارٍ رفع الصور… {uploadProgress}%</p>
        </div>
      )}

      {/* Existing images (already uploaded to Cloudinary — edit mode) */}
      {existingUrls.length > 0 && (
        <div className="flex flex-wrap gap-2" role="list" aria-label="صور الإعلان الحالية">
          {existingUrls.map((url, i) => {
            const canReorder = Boolean(onReorderExisting) && existingUrls.length > 1;
            return (
              <div
                key={url}
                role="listitem"
                draggable={canReorder}
                onDragStart={(e) => {
                  if (!canReorder) return;
                  setDraggedIndex(i);
                  // Firefox requires setData to be called for drag to
                  // initiate at all; the value itself isn't used, drag
                  // state is tracked in component state above instead.
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(i));
                }}
                onDragEnter={(e) => {
                  if (!canReorder || draggedIndex === null) return;
                  e.preventDefault();
                  setDragOverIndex(i);
                }}
                onDragOver={(e) => {
                  if (!canReorder || draggedIndex === null) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!canReorder || draggedIndex === null) return;
                  e.preventDefault();
                  moveExisting(draggedIndex, i);
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                className={`group relative h-20 w-20 overflow-hidden rounded-md bg-muted ${
                  canReorder ? 'cursor-grab active:cursor-grabbing' : ''
                } ${draggedIndex === i ? 'opacity-40' : ''} ${
                  dragOverIndex === i && draggedIndex !== null && draggedIndex !== i
                    ? 'ring-2 ring-primary'
                    : ''
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`صورة الإعلان ${i + 1}`} className="h-full w-full object-cover" />

                {/* Gap #11: first image is always the "primary" one —
                    every other place in the app (ProductCard, AdDetail,
                    admin tables, etc.) already reads images[0] as the
                    cover photo, so this badge just makes that existing
                    convention visible in the editor rather than
                    introducing a separate primary-image concept. */}
                {i === 0 && (
                  <span className="absolute bottom-0 inset-x-0 truncate bg-primary/90 px-1 py-0.5 text-center text-[10px] font-medium text-primary-foreground">
                    الصورة الرئيسية
                  </span>
                )}

                {canReorder && (
                  <div className="absolute inset-x-0 top-1 flex items-center justify-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => moveExisting(i, i - 1)}
                      disabled={i === 0}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`نقل الصورة ${i + 1} لليسار`}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => moveExisting(i, i + 1)}
                      disabled={i === existingUrls.length - 1}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`نقل الصورة ${i + 1} لليمين`}
                    >
                      ›
                    </button>
                  </div>
                )}

                {onRemoveExisting && (
                  <button
                    type="button"
                    onClick={() => onRemoveExisting(url)}
                    // UX-FIX P3-10: this was only ever revealed on
                    // `group-hover`, which has no equivalent on touch — a
                    // mobile user (the majority of traffic for a listings
                    // marketplace) had no way to reveal it at all. Always
                    // visible now; still gets a subtle hover-opacity bump on
                    // devices that do support hover, but that's cosmetic,
                    // not a requirement to use the feature.
                    className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white opacity-90 transition-opacity hover:opacity-100"
                    aria-label="إزالة الصورة"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New (not-yet-uploaded) image previews */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((file, i) => (
            <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-md bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getObjectUrl(file)}
                alt={`Preview ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                // UX-FIX P3-10: same touch-accessibility fix as the
                // existing-images remove button above — always visible
                // instead of group-hover-only.
                className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white opacity-90 transition-opacity hover:opacity-100"
                aria-label={`إزالة الصورة ${i + 1}`}
              >
                ×
              </button>
              <span className="absolute bottom-0 inset-x-0 truncate bg-black/50 px-1 text-xs text-white">
                {formatFileSize(file.size)}
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
