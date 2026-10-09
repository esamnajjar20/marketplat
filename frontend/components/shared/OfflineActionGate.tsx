'use client';

import type { ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';

/**
 * Shows a compact offline notice and optionally blocks pointer interaction.
 * UI-for message/send/report actions that need the network.
 *
 * When disableWhenOffline is true we use pointer-events-none + opacity on a
 * wrapper (not native disabled on every child). Callers that need hard keyboard
 * blocking should pass disabled to their own buttons (e.g. StickyContactBar).
 */
export function OfflineActionGate({
  children,
  message = 'هذا الإجراء يحتاج اتصالاً بالإنترنت',
  className,
  disableWhenOffline = true,
}: {
  children: ReactNode;
  message?: string;
  className?: string;
  disableWhenOffline?: boolean;
}) {
  const online = useOnlineStatus();

  return (
    <div className={cn('space-y-2', className)}>
      {!online ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-strong dark:text-warning"
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{message}</span>
        </p>
      ) : null}
      <div
        className={cn(!online && disableWhenOffline && 'pointer-events-none opacity-60')}
        aria-disabled={!online && disableWhenOffline ? true : undefined}
        // `pointer-events-none` alone does not prevent keyboard focus/activation.
        // Native inert removes descendants from focus and interaction while offline.
        inert={!online && disableWhenOffline}
      >
        {children}
      </div>
    </div>
  );
}

/** Inline status only — does not wrap/disable children. */
export function OfflineNotice({
  message = 'أنت غير متصل — بعض الإجراءات غير متاحة',
  className,
}: {
  message?: string;
  className?: string;
}) {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <p
      role="status"
      className={cn(
        'flex items-center gap-1.5 text-xs text-warning-strong dark:text-warning',
        className,
      )}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
