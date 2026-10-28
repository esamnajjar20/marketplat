/**
 * REPLACE registerNativeBackButton in lib/runtime/navigation.ts
 *
 * Phase 2: Android back closes the topmost dialog/sheet before router.back().
 */

import { isNativePlatform } from '@/lib/capacitor/platform';

type RouterLike = { back: () => void; push: (href: string) => void };

function tryCloseTopOverlay(): boolean {
  if (typeof document === 'undefined') return false;

  // Radix Dialog/Sheet content when open
  const openContent = document.querySelector(
    '[role="dialog"][data-state="open"], [data-state="open"][role="dialog"]',
  );
  if (openContent) {
    // Prefer explicit close control (Sheet/Dialog X)
    const closeBtn =
      document.querySelector<HTMLElement>(
        '[role="dialog"][data-state="open"] button[aria-label="إغلاق"], [role="dialog"][data-state="open"] [data-radix-dialog-close], [data-state="open"] button.absolute',
      ) ?? null;
    if (closeBtn) {
      closeBtn.click();
      return true;
    }
    // Escape key — Radix listens on document
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    return true;
  }

  // Explore / Create sheets controlled outside Radix role sometimes use data attributes
  const customOpen = document.querySelector<HTMLElement>('[data-native-overlay="open"]');
  if (customOpen) {
    customOpen.click();
    return true;
  }

  return false;
}

export async function registerNativeBackButton(
  router: RouterLike,
): Promise<() => void> {
  if (!(await isNativePlatform())) return () => {};

  const { App } = await import('@capacitor/app');
  const listener = await App.addListener('backButton', ({ canGoBack }) => {
    if (tryCloseTopOverlay()) return;
    if (canGoBack) {
      router.back();
    } else {
      void App.minimizeApp();
    }
  });
  return () => {
    void listener.remove();
  };
}
