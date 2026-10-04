import type { Metadata } from 'next';
import { SavedPaymentsPageClient } from '@/components/payments/SavedPaymentsPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'المحفوظات — دفع وبطاقات',
  path: '/saved-payments',
  noIndex: true,
});

export default function SavedPaymentsPage() {
  return (
    <div className="container mx-auto w-full max-w-5xl space-y-6 px-3 py-8 sm:px-4 lg:py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">المحفوظات</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          جهات الدفع وبطاقات النت — أضفها وعدّلها وابحث فيها. كل شيء محفوظ على جهازك فقط.
        </p>
      </header>
      <SavedPaymentsPageClient />
    </div>
  );
}
