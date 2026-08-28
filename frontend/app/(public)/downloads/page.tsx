import type { Metadata } from 'next';
import { DownloadsPageClient } from '@/components/downloads/DownloadsPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'التنزيلات',
  path: '/downloads',
  noIndex: true,
});

export default function DownloadsPage() {
  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">التنزيلات</h1>
        <p className="text-sm text-muted-foreground">
          سجل كتالوجات المتاجر التي حمّلتها للعرض دون اتصال. أعد التحميل من صفحة المتجر عند الحاجة.
        </p>
      </header>
      <DownloadsPageClient />
    </div>
  );
}
