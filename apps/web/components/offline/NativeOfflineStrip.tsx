'use client';

/**
 * Compact offline strip for the native shell only.
 * Mount once near root (e.g. next to CapacitorBootstrap in providers).
 */

import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { ROUTES } from '@/lib/constants';

export function NativeOfflineStrip() {
  const online = useOnlineStatus();
  const native = useIsNativeApp();

  if (!native || online) return null;

  return (
    <div
      role="status"
      className="native-offline-strip flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/15 px-3 py-2 text-xs font-medium text-foreground"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>أنت غير متصل — بعض الإجراءات تُحفظ للمزامنة لاحقاً</span>
      <Link prefetch={false} href={ROUTES.offline.sync} className="underline underline-offset-2">
        مركز المزامنة
      </Link>
    </div>
  );
}
