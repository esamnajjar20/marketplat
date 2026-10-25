import * as FileSystem from 'expo-file-system/legacy';
import { getReferencedPublicImageUris } from '@/storage/public-cache';

const IMAGE_DIRECTORY = `${FileSystem.documentDirectory ?? ''}marketplat-public-images/`;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TRACKED_FILES = 120;
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

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

async function pruneOldImages(): Promise<void> {
  try {
    const names = await FileSystem.readDirectoryAsync(IMAGE_DIRECTORY);
    if (names.length <= MAX_TRACKED_FILES) return;
    const referenced = await getReferencedPublicImageUris();
    const files: Array<{ uri: string; modified: number; referenced: boolean }> = [];
    for (const name of names) {
      if (!name || name.includes('/') || name.includes('\\')) continue;
      const uri = `${IMAGE_DIRECTORY}${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && !info.isDirectory) files.push({ uri, modified: info.modificationTime ?? 0, referenced: referenced.has(uri) });
    }
    // Unreferenced images are evicted first. A referenced image may only be removed
    // after its cache record is gone; retaining extra files is safer than breaking offline data.
    files.sort((a, b) => Number(a.referenced) - Number(b.referenced) || a.modified - b.modified);
    let excess = Math.max(0, files.length - MAX_TRACKED_FILES);
    for (const file of files) {
      if (excess <= 0) break;
      if (file.referenced) continue;
      await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => undefined);
      excess -= 1;
    }
  } catch {
    // Image caching is optional and must not break browsing.
  }
}

/** Download public ad images for offline display; failed downloads preserve the remote URL. */
export async function cachePublicImage(uri: string): Promise<string> {
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
    await pruneOldImages();
    return destination;
  } catch {
    return uri;
  }
}

export async function cachePublicImages(uris: string[]): Promise<string[]> {
  // Keep the operation bounded to avoid a large page blocking the UI or filling storage.
  return Promise.all(uris.slice(0, 8).map((uri) => cachePublicImage(uri)));
}
