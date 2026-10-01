import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PromotedPageClient } from '@/components/promoted/PromotedPageClient';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'الأكثر ترويجًا — سوق غزة',
  description:
    'منتجات وعروض مروَّجة من متاجر سوق غزة — لا تفوّت الخصومات والعروض النشطة.',
  path: '/promoted',
});

export default function PromotedPage() {
  return (
    <Suspense
      fallback={
        <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز العروض…" />
      }
    >
      <PromotedPageClient />
    </Suspense>
  );
}
