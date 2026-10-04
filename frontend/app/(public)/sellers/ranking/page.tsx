import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellersRankingList } from '@/components/sellers/SellersRankingList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'أفضل البائعين',
  description: 'ترتيب البائعين حسب التقييم والثقة وسرعة الرد',
});

export default function SellersRankingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:px-4 sm:py-8 sm:pb-8">
      <div>
        <h1 className="text-xl font-bold">أفضل البائعين</h1>
        <p className="text-sm text-muted-foreground">
          الترتيب يعتمد على التقييم، الثقة، سرعة الرد، ونشاط الحساب — وليس عدد الإعلانات فقط.
        </p>
      </div>
      <Suspense>
        <SellersRankingList limit={30} />
      </Suspense>
    </div>
  );
}
