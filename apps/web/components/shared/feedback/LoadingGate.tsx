'use client';

import type { ReactNode } from 'react';

import { useDelayedLoading, type DelayedLoadingOptions } from '@/hooks/ui/useDelayedLoading';
import { LOADING_COPY } from '@/lib/loadingCopy';

interface LoadingGateProps extends DelayedLoadingOptions {
  /** الحالة الخام من React Query (isLoading — وليس isFetching). */
  loading: boolean;
  /** هيكل التحميل (Skeleton أو PageLoadingState). */
  fallback: ReactNode;
  children: ReactNode;
  label?: string;
}

/**
 * البوّابة القياسية لحالة التحميل داخل الصفحات:
 *   <LoadingGate loading={isLoading} fallback={<AdCardSkeletonGrid />}>…المحتوى…</LoadingGate>
 *
 * - الهيكل يحجز مكانه فوراً (بلا قفزة في التخطيط) لكنه يبقى مخفياً أول `delay` ms
 *   فلا يومض عند الطلبات السريعة.
 * - إعلان واحد لقارئ الشاشة (role=status) بدل إعلانات متداخلة.
 */
export function LoadingGate({
  loading,
  fallback,
  children,
  label = LOADING_COPY.default,
  delay,
  minDuration,
}: LoadingGateProps) {
  const visible = useDelayedLoading(loading, { delay, minDuration });

  if (!loading && !visible) return <>{children}</>;

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-hidden={!visible}
      className={visible ? 'loading-reveal' : 'opacity-0'}
    >
      <span className="sr-only">{label}</span>
      {fallback}
    </div>
  );
}
