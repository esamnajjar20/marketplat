/**
 * Synchronous, dependency-free link state for code outside React (the API client).
 * Kept separate from connectivity.tsx so non-UI modules and node-side tests never import
 * the native NetInfo module.
 *
 * Only a hard disconnect (`isConnected === false`) counts: `isInternetReachable === false`
 * can be a wrong probe result (captive portals, blocked probe host) and must never block a
 * request that would otherwise succeed.
 */
let hardOffline = false;

export function isHardOffline(): boolean {
  return hardOffline;
}

/** Called only by ConnectivityProvider (and tests). */
export function setHardOffline(value: boolean): void {
  hardOffline = value;
}
