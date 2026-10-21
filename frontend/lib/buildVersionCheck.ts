/**
 * Permanent fix for stale chunks after new deploys.
 * Runs on every mount. If build-id changed → purge SW+caches → reload ONCE.
 */
const KEY_ID = 'marketplat:build-id';
const KEY_RELOAD = 'marketplat:build-reload-at';

export async function checkBuildVersion(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch('/build-id.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const { buildId } = await res.json();
    if (!buildId) return;

    const cached = localStorage.getItem(KEY_ID);
    if (cached === buildId) return;

    // New deploy detected
    const lastReload = Number(localStorage.getItem(KEY_RELOAD) || '0');
    if (Date.now() - lastReload < 60_000) {
      // Already reloaded recently → don't loop
      localStorage.setItem(KEY_ID, buildId);
      return;
    }

    localStorage.setItem(KEY_ID, buildId);
    localStorage.setItem(KEY_RELOAD, String(Date.now()));

    console.warn('[build-version] New deploy detected → purging SW + caches + reload');
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.reload();
  } catch { /* silent */ }
}
