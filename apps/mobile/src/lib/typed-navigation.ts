import type { Href } from 'expo-router';

/**
 * Convert a runtime-generated, already-authorized in-app path into Expo Router's
 * href type. Prefer a literal href or `{ pathname, params }` for normal navigation;
 * use this only at boundaries where a trusted helper has constructed the path.
 */
export function toAppHref(path: string): Href {
  if (
    !path.startsWith('/')
    || path.startsWith('//')
    || path.includes('\\')
    || /[\u0000-\u001f\u007f<>]/.test(path)
    || path.length > 2_048
  ) {
    throw new Error('Invalid internal navigation path.');
  }
  return path as Href;
}
