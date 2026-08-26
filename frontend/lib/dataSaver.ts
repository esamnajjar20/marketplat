/**
 * Client-side "data saver" preference — reduces Cloudinary thumbnail
 * dimensions and skips blur placeholders so slower mobile networks
 * transfer less image data.
 */

const KEY = 'marketplat:data-saver';

export function isDataSaverEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
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
