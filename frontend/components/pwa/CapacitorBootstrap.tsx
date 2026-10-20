'use client';

/**
 * Native-shell bootstrap — Phases 1 + 6 (theme status bar sync).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativePlatform } from '@/lib/capacitor/platform';
import { onNativePushTapped } from '@/lib/capacitor/nativePush';
import {
  applyNativeChrome,
  normalizeNativeNavigationTarget,
  registerNativeBackButton,
  registerNativeDeepLinks,
} from '@/lib/runtime/navigation';
import { syncNativeStatusBarTheme } from '@/lib/runtime/applyNativeChrome';
import { getAppMode } from '@/lib/runtime/appMode';
import { signalNavigationStart } from '@/components/shared/NavigationProgress';

export function CapacitorBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let cleanupDeepLinks: (() => void) | undefined;
    let cleanupBackButton: (() => void) | undefined;
    let cleanupPushTap: (() => void) | undefined;
    let themeObserver: MutationObserver | undefined;

    void (async () => {
      try {
        const mode = await getAppMode();
        document.documentElement.dataset.appMode = mode;
        document.documentElement.classList.toggle('is-native-app', mode === 'native');
        document.documentElement.classList.toggle('is-pwa', mode === 'pwa');
      } catch {
        /* ignore */
      }

      if (!(await isNativePlatform())) return;

      try {
        document.documentElement.style.overscrollBehavior = 'none';
        document.body.style.overscrollBehavior = 'none';
      } catch {
        /* ignore */
      }

      cleanupDeepLinks = await registerNativeDeepLinks(router);
      cleanupBackButton = await registerNativeBackButton(router);
      await applyNativeChrome();

      // Keep status bar in sync when user toggles dark/light
      themeObserver = new MutationObserver(() => {
        void syncNativeStatusBarTheme();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });

      cleanupPushTap = await onNativePushTapped((notification) => {
        const raw = notification.url;
        if (!raw) return;
        const destination = normalizeNativeNavigationTarget(raw);
        if (!destination) return;
        signalNavigationStart(destination);
        router.push(destination);
      });
    })().catch((err) => {
      console.warn('[capacitor] native bootstrap failed:', err);
    });

    return () => {
      cleanupDeepLinks?.();
      cleanupBackButton?.();
      cleanupPushTap?.();
      themeObserver?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
