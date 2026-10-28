'use client';

import type { ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { QueryRetryCard } from '@/components/shared/feedback/QueryRetryCard';

interface OfflineQueryFallbackProps {
  /** Content to show while online (usually the existing skeleton/error UI). */
  fallback: ReactNode;
  title?: string;
  description?: string;
  /** Keep the normal loading UI visible until the query has attempted its offline snapshot fallback. */
  loading?: boolean;
  /** Optional retry when offline (e.g. user came back online). */
  onRetry?: () => void;
}

/**
 * Avoids presenting an endless loading skeleton or a futile retry action when
 * a query has neither in-memory nor persisted data and the device is offline.
 * Uses the shared QueryRetryCard so the retry CTA matches the rest of the app.
 */
export function OfflineQueryFallback({
  fallback,
  title = 'هذه البيانات غير متاحة دون اتصال',
  description = 'لا توجد نسخة محفوظة لهذه البيانات على الجهاز. اتصل بالإنترنت لتحميلها، وستُتاح دون اتصال في زيارة لاحقة إذا كانت ضمن بيانات الكاش.',
  loading = false,
  onRetry,
}: OfflineQueryFallbackProps) {
  const isOnline = useOnlineStatus();

  if (isOnline || loading) return <>{fallback}</>;

  return (
    <QueryRetryCard
      tone="offline"
      title={title}
      description={description}
      onRetry={onRetry}
      icon={<WifiOff className="h-6 w-6" aria-hidden />}
    />
  );
}
