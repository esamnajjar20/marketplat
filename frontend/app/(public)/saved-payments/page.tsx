import type { Metadata } from 'next';
import { SavedPaymentsPageClient } from '@/components/payments/SavedPaymentsPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'الدفع والبطاقات المحفوظة',
  path: '/saved-payments',
  noIndex: true,
});

export default function SavedPaymentsPage() {
  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">الدفع والبطاقات المحفوظة</h1>
        <p className="text-sm text-muted-foreground">
          الأسماء والأرقام وبطاقات النت التي حفظتها محليًا على هذا الجهاز — للنسخ السريع عند الدفع.
        </p>
      </header>
      <SavedPaymentsPageClient />
    </div>
  );
}
