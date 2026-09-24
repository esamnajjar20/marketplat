import type { Metadata } from 'next';
import { OfflineControlClient } from '@/components/settings/OfflineControlClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'العمل بدون إنترنت',
  noIndex: true,
});

/**
 * SW-WARMING-USER-CONTROL-01: user-facing warming controls. Renders a
 * client component that reads/writes warmingPreferences, shows live
 * state from offlineWarmingState's IndexedDB snapshot, and offers
 * manual controls (re-warm now, clear warming cache).
 */
export default function OfflineControlPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">العمل بدون إنترنت</h1>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
          تحكّم في استهلاك البيانات والمساحة المستخدمة لتحضير التطبيق
          للعمل عند انقطاع الاتصال. التنزيلات اليدوية والإعلانات المحفوظة
          لا تتأثر بهذه الإعدادات.
        </p>
      </div>
      <OfflineControlClient />
    </div>
  );
}
