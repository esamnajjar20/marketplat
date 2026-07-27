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
