/**
 * Miscellaneous utility functions.
 *
 * Note: cn() re-exports the shadcn/ui class merger so components only
 * need one import for class composition.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes safely (handles conflicts and conditional classes). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Delay execution — useful in optimistic UI rollbacks. */
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Type-safe object keys. */
export const typedKeys = <T extends object>(obj: T) =>
  Object.keys(obj) as (keyof T)[];

/** Return a value clamped between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Check if code is running on the server. */
export const isServer = typeof window === 'undefined';

// FIX SEC-4.4: identical byte-for-byte across 6 admin category-form
// components (CreateCategoryButton, EditCategoryButton, and their
// Product/Service counterparts) — the only thing that ever varied
// between copies was the fallback prefix used when the input slugifies
// to an empty string (e.g. an all-emoji name). Consolidated here; each
// call site now just passes its own fallback prefix.
/**
 * Convert a display name into a URL-safe slug matching the backend's
 * `/^[a-z0-9-]+$/` validation (e.g. createProductCategorySchema).
 * Falls back to `${fallbackPrefix}-${Date.now()}` if the input has no
 * ASCII alphanumeric characters at all (e.g. Arabic-only input).
 */
export function slugify(input: string, fallbackPrefix: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `${fallbackPrefix}-${Date.now()}`;
}
