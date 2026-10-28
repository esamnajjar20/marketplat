/**
 * PWA app-icon badge (Badging API) — shows unread notification count
 * on installed PWAs (Chrome/Android and supporting desktop browsers).
 * No-ops safely when the API is unavailable.
 */

export function setAppBadgeCount(count: number): void {
  if (typeof navigator === 'undefined') return;
  try {
    if (count > 0 && 'setAppBadge' in navigator) {
      void (navigator as Navigator & { setAppBadge: (n?: number) => Promise<void> }).setAppBadge(
        Math.min(count, 99),
      );
    } else if (count <= 0 && 'clearAppBadge' in navigator) {
      void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
    }
  } catch {
    /* unsupported or permission denied */
  }
}

export function clearAppBadge(): void {
  setAppBadgeCount(0);
}
