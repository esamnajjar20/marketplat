'use client';

import type { ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface OfflineQueryFallbackProps {
  /** Content to show while online (usually the existing skeleton/error UI). */
  fallback: ReactNode;
  title?: string;
  description?: string;
}

/**
 * Avoids presenting an endless loading skeleton or a futile retry action when
 * a query has neither in-memory nor persisted data and the device is offline.
 * The normal online loading/error UI remains unchanged.
 */
export function OfflineQueryFallback({
  fallback,
  title = 'هذه البيانات غير متاحة دون اتصال',
  description = 'لا توجد نسخة محفوظة لهذه البيانات على الجهاز. اتصل بالإنترنت لتحميلها، وستُتاح دون اتصال في زيارة لاحقة إذا كانت ضمن بيانات الكاش.',
}: OfflineQueryFallbackProps) {
  const isOnline = useOnlineStatus();

  if (isOnline) return <>{fallback}</>;

  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-10 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <WifiOff className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </section>
  );
}
