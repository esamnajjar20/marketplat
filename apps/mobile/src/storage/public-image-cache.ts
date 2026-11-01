import * as FileSystem from 'expo-file-system/legacy';
import { getReferencedPublicImageUris } from '@/storage/public-cache';
import { planPublicImageEviction, MAX_TRACKED_PUBLIC_IMAGES, MAX_PUBLIC_IMAGE_CACHE_BYTES } from './public-image-cache-policy.mjs';

const IMAGE_DIRECTORY = `${FileSystem.documentDirectory ?? ''}marketplat-public-images/`;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const downloadsInFlight = new Map<string, Promise<string>>();
let pruneQueue: Promise<void> = Promise.resolve();

function hash(value: string): string {
  // Stable, non-cryptographic key; URLs are identifiers, not secrets.
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16);
}

function extensionFor(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const extension = pathname.split('.').pop()?.toLowerCase() ?? '';
    return ALLOWED_EXTENSIONS.has(extension) ? extension : 'img';
  } catch {
    return 'img';
  }
}

async function pruneOldImagesInternal(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    const names = await FileSystem.readDirectoryAsync(IMAGE_DIRECTORY).catch(() => []);
    if (!names.length) return;
    const referenced = await getReferencedPublicImageUris();
    const files: Array<{ uri: string; modified: number; sizeBytes: number; referenced: boolean }> = [];
    for (const name of names) {
      if (!name || name.includes('/') || name.includes('\\')) continue;
      const uri = `${IMAGE_DIRECTORY}${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && !info.isDirectory) {
        files.push({
          uri,
          modified: info.modificationTime ?? 0,
          sizeBytes: typeof info.size === 'number' ? Math.max(0, info.size) : 0,
          referenced: referenced.has(uri),
        });
      }
    }

    const evicted = planPublicImageEviction(files, {
      maxFiles: MAX_TRACKED_PUBLIC_IMAGES,
      maxBytes: MAX_PUBLIC_IMAGE_CACHE_BYTES,
    });
    for (const uri of evicted) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
  } catch {
    // Image caching is optional and must not break browsing.
  }
}

/** Serialize pruning so concurrent page/image loads cannot race the same file inventory. */
export function prunePublicImageCache(): Promise<void> {
  const task = pruneQueue.then(pruneOldImagesInternal, pruneOldImagesInternal);
  pruneQueue = task.catch(() => undefined);
  return task;
}

async function downloadPublicImage(uri: string): Promise<string> {
  if (!/^https?:\/\//i.test(uri) || !FileSystem.documentDirectory) return uri;
  try {
    await FileSystem.makeDirectoryAsync(IMAGE_DIRECTORY, { intermediates: true }).catch(() => undefined);
    const destination = `${IMAGE_DIRECTORY}${hash(uri)}.${extensionFor(uri)}`;
    const existing = await FileSystem.getInfoAsync(destination);
    if (existing.exists && !existing.isDirectory && typeof existing.size === 'number' && existing.size > 0 && existing.size <= MAX_IMAGE_BYTES) {
      return destination;
    }
    if (existing.exists) await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);

    const result = await FileSystem.downloadAsync(uri, destination);
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
      return uri;
    }
    const info = await FileSystem.getInfoAsync(destination);
    if (!info.exists || info.isDirectory || typeof info.size !== 'number' || info.size <= 0 || info.size > MAX_IMAGE_BYTES) {
      await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
      return uri;
    }
    return destination;
  } catch {
    return uri;
  }
}

/** Download public images; caller persists references before invoking prunePublicImageCache(). */
export async function cachePublicImage(uri: string): Promise<string> {
  if (!/^https?:\/\//i.test(uri) || !FileSystem.documentDirectory) return uri;
  const active = downloadsInFlight.get(uri);
  if (active) return active;
  const task = downloadPublicImage(uri);
  downloadsInFlight.set(uri, task);
  try {
    return await task;
  } finally {
    if (downloadsInFlight.get(uri) === task) downloadsInFlight.delete(uri);
  }
}

export async function cachePublicImages(uris: string[]): Promise<string[]> {
  // Keep the operation bounded to avoid a large page blocking the UI or filling storage.
  // allSettled: a single image failure must not discard the others' results.
  const urls = uris.slice(0, 8);
  const results = await Promise.allSettled(urls.map((uri) => cachePublicImage(uri)));
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : urls[i]);
}

/** Keep only image files managed by this cache that still exist on disk. */
export async function filterAvailablePublicImageUris(uris: string[]): Promise<string[]> {
  const available: string[] = [];
  for (const uri of uris.slice(0, 8)) {
    if (!uri.startsWith(IMAGE_DIRECTORY)) continue;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && !info.isDirectory && typeof info.size === 'number' && info.size > 0 && info.size <= MAX_IMAGE_BYTES) {
        available.push(uri);
      }
    } catch {
      // A missing/unreadable image must not be represented as an offline asset.
    }
  }
  return available;
}
