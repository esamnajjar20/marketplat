export const MAX_TRACKED_PUBLIC_IMAGES: number;
export const MAX_PUBLIC_IMAGE_CACHE_BYTES: number;
export function planPublicImageEviction(
  files: ReadonlyArray<{ uri: string; modified: number; sizeBytes: number; referenced: boolean }>,
  limits?: { maxFiles?: number; maxBytes?: number },
): string[];
