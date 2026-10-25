import type { Metadata } from 'next';
import { SavedPaymentsPageClient } from '@/components/payments/SavedPaymentsPageClient';
import { buildMetadata } from '@/lib/seo';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = buildMetadata({
  title: 'المحفوظات — دفع وبطاقات',
  path: '/saved-payments',
  noIndex: true,
});

export default function SavedPaymentsPage() {
  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link href="/offline?tab=payments" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
        العودة إلى مركز الأوفلاين
      </Link>
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
