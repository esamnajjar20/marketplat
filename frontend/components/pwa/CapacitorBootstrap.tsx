/**
 * Native-shell bootstrap — sibling to PwaBootstrap (SW / web-PWA only).
 * No-op on plain web. Logic for back/deep-links/chrome lives in
 * lib/runtime/navigation.ts; push tap routing stays here (needs router).
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativePlatform } from '@/lib/capacitor/platform';
import { onNativePushTapped } from '@/lib/capacitor/nativePush';
import {
  applyNativeChrome,
  registerNativeBackButton,
  registerNativeDeepLinks,
} from '@/lib/runtime/navigation';
import { getAppMode } from '@/lib/runtime/appMode';

export function CapacitorBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let cleanupDeepLinks: (() => void) | undefined;
    let cleanupBackButton: (() => void) | undefined;
    let cleanupPushTap: (() => void) | undefined;

    void (async () => {
      // data-app-mode on <html> for CSS (safe-area, chrome) — all modes
      try {
        const mode = await getAppMode();
        document.documentElement.dataset.appMode = mode;
      } catch {
        /* ignore */
      }

      if (!(await isNativePlatform())) return;

      cleanupDeepLinks = await registerNativeDeepLinks(router);
      cleanupBackButton = await registerNativeBackButton(router);
      await applyNativeChrome();

      cleanupPushTap = await onNativePushTapped((notification) => {
        const raw = notification.url;
        if (!raw) return;
        if (raw.startsWith('/')) {
          router.push(raw);
          return;
        }
        try {
          const parsed = new URL(raw);
          router.push(`${parsed.pathname}${parsed.search}` || '/');
        } catch {
          /* malformed */
        }
      });
    })();

    return () => {
      cleanupDeepLinks?.();
      cleanupBackButton?.();
      cleanupPushTap?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
