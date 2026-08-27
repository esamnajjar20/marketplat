/**
 * Client-side data-saver preference — reduces Cloudinary sizes and skips
 * blur placeholders on slower networks.
 *
 * Enabled when:
 * - user toggled localStorage flag, OR
 * - browser Save-Data / effectiveType is 2g / slow-2g (N2 auto)
 */

const KEY = 'marketplat:data-saver';

function connectionWantsSaver(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  const t = conn.effectiveType;
  return t === 'slow-2g' || t === '2g';
}

export function isDataSaverEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  return connectionWantsSaver();
}

export function setDataSaverEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent('marketplat:data-saver', { detail: on }));
  } catch {
    /* ignore */
  }
}
