/**
 * Stale-chunk guard after a new deploy.
 * Runs on every mount. If build-id changed → purge the cached HTML/chunk shells
 * and reload ONCE, but only when it will not interrupt the user.
 *
 * FIX BUILD-SOFT-PURGE-01 (round 2): the previous version unregistered the SW,
 * deleted every cache except saved ads (including per-user offline data, core
 * bundle and images) and hard-reloaded immediately — losing half-typed forms and
 * forcing a full offline re-warm after every deploy. Now:
 *  - only the versioned STATIC cache (HTML shells + hashed chunks, the only place
 *    stale build output lives) is purged; user-data / core / personal-shell / api /
 *    images / saved-ads survive. The SW's own `activate` cleanup and update flow
 *    (lib/pwa.ts) still handle SW code and old-version caches.
 *  - the SW is not unregistered.
 *  - the reload is deferred until the tab is hidden (or the page is being left),
 *    so it never lands mid-typing. Chunk-load recovery (lib/errorReporter.ts)
 *    still covers a navigation that hits a rotated chunk before then.
 */
const KEY_ID = 'marketplat:build-id';
const KEY_RELOAD = 'marketplat:build-reload-at';
const PURGE_CACHE_PREFIXES = ['market-static-'];

function reloadWhenNotInUse(): void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', go);
    // Never reload into an offline error screen.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    window.location.reload();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') go();
  };
  if (document.visibilityState === 'hidden') {
    go();
    return;
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', go);
}

export async function checkBuildVersion(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch('/build-id.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const { buildId } = await res.json();
    if (!buildId) return;

    const cached = localStorage.getItem(KEY_ID);
    if (cached === buildId) return;

    // FIX BUILD-FIRSTVISIT-01: no stored id = first visit, nothing stale to purge.
    if (cached === null) {
      localStorage.setItem(KEY_ID, buildId);
      return;
    }

    // New deploy detected
    const lastReload = Number(localStorage.getItem(KEY_RELOAD) || '0');
    if (Date.now() - lastReload < 60_000) {
      // Already reloaded recently → don't loop
      localStorage.setItem(KEY_ID, buildId);
      return;
    }

    localStorage.setItem(KEY_ID, buildId);
    localStorage.setItem(KEY_RELOAD, String(Date.now()));

    console.warn('[build-version] New deploy detected → purging static shells, reload when idle');
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => PURGE_CACHE_PREFIXES.some((p) => k.startsWith(p))).map((k) => caches.delete(k)),
      );
    }
    reloadWhenNotInUse();
  } catch { /* silent */ }
}
