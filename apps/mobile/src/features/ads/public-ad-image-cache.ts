import { listThumbnailUri } from '@/lib/image-variants';

export type PublicAdImageCacheCandidate = {
  remoteUri: string;
  cacheUri: string;
};

type AdWithImages = { images: string[] };

/**
 * Build a bounded, de-duplicated image plan for public ad lists.
 * Cloudinary URLs are transformed before download so the local file is a list
 * thumbnail rather than the full-resolution source image.
 */
export function getPublicAdImageCacheCandidates(
  items: AdWithImages[],
  maxImages = 8,
): PublicAdImageCacheCandidate[] {
  const seen = new Set<string>();
  const candidates: PublicAdImageCacheCandidate[] = [];
  const limit = Number.isFinite(maxImages) ? Math.max(0, Math.floor(maxImages)) : 0;
  if (limit === 0) return candidates;

  for (const item of items) {
    for (const uri of item.images) {
      if (!/^https?:\/\//i.test(uri) || seen.has(uri)) continue;
      seen.add(uri);
      candidates.push({ remoteUri: uri, cacheUri: listThumbnailUri(uri) });
      if (candidates.length >= limit) return candidates;
    }
  }

  return candidates;
}

/** Replace remote references only when a real app-private local file exists. */
export function applyCachedPublicAdImages<T extends AdWithImages>(
  items: T[],
  candidates: PublicAdImageCacheCandidate[],
  cachedUris: string[],
): T[] {
  const localByRemoteUri = new Map<string, string>();

  candidates.forEach((candidate, index) => {
    const cachedUri = cachedUris[index];
    if (typeof cachedUri === 'string' && cachedUri.startsWith('file://')) {
      localByRemoteUri.set(candidate.remoteUri, cachedUri);
    }
  });

  if (localByRemoteUri.size === 0) return items;

  return items.map((item) => ({
    ...item,
    images: item.images.map((uri) => localByRemoteUri.get(uri) ?? uri),
  }));
}

/** Start non-essential list-image work without making the caller await it. */
export function schedulePublicAdImageCaching(task: () => Promise<unknown>): void {
  void Promise.resolve().then(task).catch(() => undefined);
}
