/**
 * Detect a newly deployed build without interrupting an active session.
 *
 * A build-id mismatch is informational only: it must never purge offline
 * shells, reload the document, or attach visibility/pagehide reload handlers.
 * Service Worker updates are surfaced through UpdatePrompt and are applied
 * only after an explicit user action. Old chunks retain their separate,
 * bounded stale-chunk recovery path for the rare case where a lazy import
 * genuinely points at a removed asset.
 */
import { isDeviceOffline } from '@/lib/offlineError';
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage';

const KEY_ID = 'marketplat:build-id';

export async function checkBuildVersion(): Promise<void> {
  if (typeof window === 'undefined') return;
  // This is informational only. Do not emit a known-to-fail request or
  // create noisy network-error telemetry while the device is offline.
  if (isDeviceOffline()) return;
  try {
    const res = await fetch('/build-id.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const { buildId } = await res.json();
    if (typeof buildId !== 'string' || !buildId) return;

    const cached = safeStorageGet(KEY_ID);
    if (cached === buildId) return;

    // First visit or a new deployment: record the observed build only.
    // Do not clear CacheStorage here; it contains offline route shells that
    // the active session may still need. The new SW migrates/cleans caches
    // after the user explicitly accepts the update.
    safeStorageSet(KEY_ID, buildId);
    if (cached !== null) {
      console.info('[build-version] New build detected; update is available without interrupting this session');
      window.dispatchEvent(new CustomEvent('marketplat:build-version-changed', {
        detail: { previousBuildId: cached, buildId },
      }));
    }
  } catch {
    // Version discovery is best-effort and must never affect page rendering.
  }
}
