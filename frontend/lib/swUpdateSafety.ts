/** Shared safety check for every automatic Service Worker activation path. */
export function isUserBusyForServiceWorkerUpdate(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const active = document.activeElement as HTMLElement | null;
    if (active) {
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) return true;
    }
    if (document.querySelector('[data-draft-open="true"]')) return true;
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    return Boolean(selection && selection.toString().length > 0);
  } catch {
    // Unknown editing state must defer an activation rather than risk data loss.
    return true;
  }
}
