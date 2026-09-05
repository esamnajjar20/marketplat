import type { Metadata } from 'next';
import { SavedOfflineAdsPageClient } from '@/components/ads/SavedOfflineAdsPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'الإعلانات المحفوظة دون اتصال',
  path: '/saved-ads',
  noIndex: true,
});

export default function SavedAdsPage() {
  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">الإعلانات المحفوظة دون اتصال</h1>
        <p className="text-sm text-muted-foreground">
          الإعلانات التي حفظتها صراحة على هذا الجهاز — تفتح كاملة (الصور والتفاصيل) حتى بدون إنترنت.
        </p>
      </header>
      <SavedOfflineAdsPageClient />
    </div>
  );
}
