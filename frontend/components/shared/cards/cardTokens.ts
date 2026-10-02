/**
 * Pure card helpers — deliberately NOT a 'use client' module so server
 * components (e.g. StoreCard) can import these constants/functions as plain
 * values.
 */

/**
 * Colour for the "published X ago" label. Only genuinely fresh (< 24h) items
 * are highlighted; older ones stay neutral — the previous amber tier made a
 * 3-day-old listing look like a warning.
 */
export function freshnessClass(now: number | null, createdAt: string): string {
  if (now === null) return 'text-muted-foreground';
  const ageHours = (now - new Date(createdAt).getTime()) / 3_600_000;
  return Number.isFinite(ageHours) && ageHours < 24 ? 'text-success' : 'text-muted-foreground';
}

/** Placeholder while `now` is unknown: keeps the row height, shows no stray dash. */
export const TIME_PLACEHOLDER = '\u00A0';

/** Extra tap area around a 36px overlay button, without changing its look. */
export const HIT_AREA = "after:absolute after:-inset-1.5 after:content-['']";
