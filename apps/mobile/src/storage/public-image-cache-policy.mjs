export const MAX_TRACKED_PUBLIC_IMAGES = 120;
export const MAX_PUBLIC_IMAGE_CACHE_BYTES = 80 * 1024 * 1024;

/**
 * Plan deletion of the oldest unreferenced image files until both limits are met.
 * Referenced files are pinned even when that means the cache remains above budget.
 */
export function planPublicImageEviction(files, limits = {}) {
  const maxFiles = Number.isInteger(limits.maxFiles) && limits.maxFiles >= 0
    ? limits.maxFiles : MAX_TRACKED_PUBLIC_IMAGES;
  const maxBytes = Number.isFinite(limits.maxBytes) && limits.maxBytes >= 0
    ? limits.maxBytes : MAX_PUBLIC_IMAGE_CACHE_BYTES;

  const sorted = [...files].sort((a, b) =>
    Number(Boolean(a.referenced)) - Number(Boolean(b.referenced))
    || (a.modified - b.modified)
    || String(a.uri).localeCompare(String(b.uri)),
  );
  let keptFiles = files.length;
  let keptBytes = files.reduce((sum, file) => sum + (Number.isFinite(file.sizeBytes) ? Math.max(0, file.sizeBytes) : 0), 0);
  const evicted = [];

  for (const file of sorted) {
    if (keptFiles <= maxFiles && keptBytes <= maxBytes) break;
    if (file.referenced) continue;
    evicted.push(file.uri);
    keptFiles -= 1;
    keptBytes = Math.max(0, keptBytes - (Number.isFinite(file.sizeBytes) ? Math.max(0, file.sizeBytes) : 0));
  }
  return evicted;
}
