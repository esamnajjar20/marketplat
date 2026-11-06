'use client';

/**
 * PERF-BUNDLE-DETAIL-01 — إجراءات ثانوية في صفحات التفاصيل (متجر/خدمة) خلف dynamic({ ssr: false }).
 *
 * كانت تُستورد ثابتًا فتدخل حزمة /stores/[id] و/services/[id] الأولى:
 *   SaveOfflineButton → offlineSavedEntities (~13 KB)، ShareAdButton → ShareAdQrDialog + shareQr،
 *   ReportButton → Select (radix)، DownloadStoreCatalogButton (~16 KB)، StorePaymentMethods (~14 KB).
 * هذه أزرار/حوارات تفاعلية لا تحتاج SSR؛ الـ placeholders تحجز مساحة تقريبية لتقليل CLS.
 */
import dynamic from 'next/dynamic';

const slot = (cls: string) => () => <span aria-hidden="true" className={cls} />;

export const LazySaveOfflineButton = dynamic(
  () => import('@/components/shared/SaveOfflineButton').then((m) => m.SaveOfflineButton),
  { ssr: false, loading: slot('inline-block h-10 w-full') },
);

export const LazyShareAdButton = dynamic(
  () => import('@/components/ads/ShareAdButton').then((m) => m.ShareAdButton),
  { ssr: false, loading: slot('inline-block h-10 w-full') },
);

export const LazyReportStoreButton = dynamic(
  () => import('@/components/stores/ReportStoreButton').then((m) => m.ReportStoreButton),
  { ssr: false, loading: slot('inline-block h-8 w-full') },
);

export const LazyReportServiceButton = dynamic(
  () => import('@/components/services/ReportServiceButton').then((m) => m.ReportServiceButton),
  { ssr: false, loading: slot('inline-block h-8 w-full') },
);

export const LazyDownloadStoreCatalogButton = dynamic(
  () => import('@/components/stores/DownloadStoreCatalogButton').then((m) => m.DownloadStoreCatalogButton),
  { ssr: false, loading: slot('inline-block h-10 w-full') },
);

export const LazyStorePaymentMethods = dynamic(
  () => import('@/components/payment/StorePaymentMethods').then((m) => m.StorePaymentMethods),
  { ssr: false, loading: slot('mt-1 block h-12 w-full') },
);
