import * as FileSystem from 'expo-file-system/legacy';
import type { SelectedAdImage } from '@/features/ads/manage-ads.api';
import { listAllOutboxMutations } from './mutation-outbox';
import { isAdImageReferencedByDraft } from './ad-draft-store';

const IMAGE_DIRECTORY = `${FileSystem.documentDirectory ?? ''}marketplat-offline-images/`;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function safeFileName(name: string, mimeType: string): string {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  return cleaned && /\.(jpg|jpeg|png|webp)$/i.test(cleaned) ? cleaned : `${cleaned || `image-${Date.now()}`}.${extension}`;
}

/** Copy picker/cache URIs into the app's persistent document directory and verify actual size. */
export async function persistSelectedAdImage(image: SelectedAdImage): Promise<SelectedAdImage & { sizeBytes: number }> {
  if (!FileSystem.documentDirectory) throw new Error('مساحة حفظ الصور الدائمة غير متاحة على هذا الجهاز.');
  if (!ALLOWED_TYPES.has(image.mimeType.toLowerCase())) throw new Error('نوع الصورة غير مدعوم؛ استخدم JPEG أو PNG أو WebP.');
  if (!/^(file|content):\/\//i.test(image.uri)) throw new Error('مسار الصورة المختارة غير محلي.');

  await FileSystem.makeDirectoryAsync(IMAGE_DIRECTORY, { intermediates: true }).catch(() => undefined);
  const source = await FileSystem.getInfoAsync(image.uri);
  if (!source.exists || source.isDirectory) throw new Error('تعذر العثور على ملف الصورة المختارة. اختر الصورة مجددًا.');
  if (typeof source.size !== 'number' || source.size <= 0 || source.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('يجب أن يكون حجم كل صورة أكبر من صفر ولا يتجاوز 5MB.');
  }

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeFileName(image.fileName, image.mimeType)}`;
  const destination = `${IMAGE_DIRECTORY}${fileName}`;
  await FileSystem.copyAsync({ from: image.uri, to: destination });
  const persisted = await FileSystem.getInfoAsync(destination);
  if (!persisted.exists || persisted.isDirectory || typeof persisted.size !== 'number' || persisted.size !== source.size) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw new Error('تعذر التحقق من حفظ الصورة كاملة؛ حاول اختيارها مجددًا.');
  }
  return { ...image, uri: destination, fileName: safeFileName(image.fileName, image.mimeType), sizeBytes: persisted.size };
}


/** Delete an app-managed image only when no retained outbox operation references it. */
export async function removePersistedAdImageIfUnused(uri: string): Promise<'deleted' | 'retained' | 'outside-managed-directory' | 'missing'> {
  if (!FileSystem.documentDirectory || !uri.startsWith(IMAGE_DIRECTORY)) return 'outside-managed-directory';
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) return 'missing';

  // A saved draft is also a live reference: removing a tile must not race with
  // the draft autosave and delete the only durable copy of its image.
  if (await isAdImageReferencedByDraft(uri)) return 'retained';

  const operations = await listAllOutboxMutations();
  for (const operation of operations) {
    try {
      const payload: unknown = JSON.parse(operation.payloadJson);
      // Delete operations normally have no image list and cannot introduce image
      // references. For create/update, an absent or malformed list is ambiguous:
      // keep the file rather than interpreting uncertainty as proof it is unused.
      if (operation.operation === 'delete-ad') continue;
      if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { images?: unknown }).images)) {
        return 'retained';
      }
      const images = (payload as { images: unknown[] }).images;
      if (images.some((image) => !image || typeof image !== 'object' || typeof (image as { uri?: unknown }).uri !== 'string')) {
        return 'retained';
      }
      const referenced = images.some((image) => (image as { uri: string }).uri === uri);
      if (referenced) return 'retained';
    } catch {
      // A malformed retained operation is not evidence that this file is unused;
      // conservatively retain it rather than risk breaking a queued mutation.
      return 'retained';
    }
  }

  await FileSystem.deleteAsync(uri, { idempotent: true });
  return 'deleted';
}

const ORPHAN_IMAGE_MIN_AGE_MS = 24 * 60 * 60 * 1_000;

/**
 * Reclaim image files left behind by a crash between copying a picked image and
 * saving its draft/outbox payload. Only old files are considered: recently copied
 * images may still be between those steps. Reference checks remain conservative.
 */
export async function cleanupStaleUnreferencedAdImages(
  now = Date.now(),
  minimumAgeMs = ORPHAN_IMAGE_MIN_AGE_MS,
): Promise<{ scanned: number; deleted: number; retained: number }> {
  if (!FileSystem.documentDirectory) return { scanned: 0, deleted: 0, retained: 0 };
  const directory = await FileSystem.getInfoAsync(IMAGE_DIRECTORY);
  if (!directory.exists || !directory.isDirectory) return { scanned: 0, deleted: 0, retained: 0 };
  const names = await FileSystem.readDirectoryAsync(IMAGE_DIRECTORY);
  let scanned = 0;
  let deleted = 0;
  let retained = 0;
  for (const name of names) {
    // The directory is app-managed; never accept separators from a listed name.
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') continue;
    const uri = `${IMAGE_DIRECTORY}${name}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || typeof info.modificationTime !== 'number') continue;
    if (now - info.modificationTime * 1_000 < minimumAgeMs) continue;
    scanned += 1;
    try {
      const result = await removePersistedAdImageIfUnused(uri);
      if (result === 'deleted' || result === 'missing') deleted += 1;
      else retained += 1;
    } catch {
      // Storage errors must never cause the app to delete by an alternate path.
      retained += 1;
    }
  }
  return { scanned, deleted, retained };
}
